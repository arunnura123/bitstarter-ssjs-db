#!/usr/bin/env node
var async   = require('async')
  , express = require('express')
  , fs      = require('fs')
  , http    = require('http')
  , https   = require('https')
  , db      = require('./models');
var outfile="/tmp/demands.txt";
var pg = require('pg');
var counter=0;
var app = express();
var conf=process.env.DATABASE_URL || 'postgres://ubuntu:bitpass0@localhost:5432/bitdb0';
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.set('port', process.env.PORT || 8080);

app.configure(function(){
app.use(express.bodyParser());
app.use(app.router);
  
});


app.post('/', function (request, response) {
 var data = fs.readFileSync('index.html').toString();
 var wStrin  =  request.body.what.replace(/ /g, "_");
 var hStrin  = request.body.where.replace(/ /g, "_");
 var mStrin  = request.body.mail.replace(/ /g, "_"); 
 var ipAddress;
 var forwardedIpsStr = request.header('x-forwarded-for'); 

  if (forwardedIpsStr) {
    var forwardedIps = forwardedIpsStr.split(',');
    ipAddress = forwardedIps[0];
  }
  if (!ipAddress) {
    // Ensure getting client IP address still works in
    // development environment
    ipAddress = request.connection.remoteAddress;
  }
 
 var sdat=ipAddress;
 var obj='';
 var mdat='';
 var dat="http://freegeoip.net/json/"+ ipAddress;
if(!wStrin || !hStrin || !mStrin)
 {
      response.status(400);
       return response.send(data + " Error Processing " );
 }  

 http.get(dat, function(res) {
    res.on('data', function (chunk){
      mdat+=chunk;
      } );
 res.on('end',function(){
      obj = JSON.parse(mdat);
      console.log(obj.city);
      mdat=obj.city;
      if(!mdat)
       mdat=obj.country_name;
 pg.connect(conf, function(err, client, done) {
 if(err) return console.error(err);
  client.query("INSERT INTO whatuneed (need,location,mail,ip,place) VALUES ('" + wStrin + "','" + hStrin + "','" + mStrin + "' , '" + sdat + "' , '" + mdat +"' ) ", function(err, result) {
    done();
    if(err) return console.error(err);
  });
});    

    });

   });

  response.send(data + "YOUR IP :" + ipAddress);
});


app.get('/Info.html', function (request, response) {
pg.connect(conf, function(err, client, done) {
 if(err) return console.error(err);
  client.query('SELECT * FROM whatuneed', function(err, result) {
    done();
    if(err) return console.error(err);
  response.send (result.rows); 
  }); 
});
});


// Render homepage (note trailing slash): example.com/

app.get('/Preoder.html', function(request, response) {
  var data = fs.readFileSync('Preoder.html').toString();
  response.send(data);
});



app.get('/', function(request, response) {
  var data = fs.readFileSync('index.html').toString();
  response.send(data);
});




app.get('/Visuals.html', function(request, response) {
  
  var data = fs.readFileSync('Visuals.html').toString();
  pg.connect(conf, function(err, client, done) {
 if(err) return console.error(err);
  client.query('SELECT * FROM whatuneed', function(err, result) {
    done();
    if(err) return console.error(err);
  response.send('result.rows.length');
  });
});
 
});


app.get('/About.html', function(request, response) {
  var data = fs.readFileSync('About.html').toString();
  response.send(data);
});


app.get('/contact.html', function(request, response) {
  var data = fs.readFileSync('contact.html').toString();
  response.send(data);
});

// Render example.com/orders
app.get('/orders', function(request, response) {
  global.db.Order.findAll().success(function(orders) {
    var orders_json = [];
    orders.forEach(function(order) {
      orders_json.push({id: order.coinbase_id, amount: order.amount, time: order.time});
    });
    // Uses views/orders.ejs
    response.render("orders", {orders: orders_json});
  }).error(function(err) {
    console.log(err);
    response.send("error retrieving orders");
  });
});

// Hit this URL while on example.com/orders to refresh
app.get('/refresh_orders', function(request, response) {
  https.get("https://coinbase.com/api/v1/orders?api_key=" + process.env.COINBASE_API_KEY, function(res) {
    var body = '';
    res.on('data', function(chunk) {body += chunk;});
    res.on('end', function() {
      try {
        var orders_json = JSON.parse(body);
        if (orders_json.error) {
          response.send(orders_json.error);
          return;
        }
        // add each order asynchronously
        async.forEach(orders_json.orders, addOrder, function(err) {
          if (err) {
            console.log(err);
            response.send("error adding orders");
          } else {
            // orders added successfully
            response.redirect("/orders");
          }
        });
      } catch (error) {
        console.log(error);
        response.send("error parsing json");
      }
    });

    res.on('error', function(e) {
      console.log(e);
      response.send("error syncing orders");
    });
  });

});

// sync the database and start the server
db.sequelize.sync().complete(function(err) {
  if (err) {
    throw err;
  } else {
    http.createServer(app).listen(app.get('port'), function() {
    counter+=1;  
      console.log("Listening on " + app.get('port'));
  });
  }
});

// add order to the database if it doesn't already exist
var addOrder = function(order_obj, callback) {
  var order = order_obj.order; // order json from coinbase
  if (order.status != "completed") {
    // only add completed orders
    callback();
  } else {
    var Order = global.db.Order;
    // find if order has already been added to our database
    Order.find({where: {coinbase_id: order.id}}).success(function(order_instance) {
      if (order_instance) {
        // order already exists, do nothing
        callback();
      } else {
        // build instance and save
          var new_order_instance = Order.build({
          coinbase_id: order.id,
          amount: order.total_btc.cents / 100000000, // convert satoshis to BTC
          time: order.created_at
        });
          new_order_instance.save().success(function() {
          callback();
        }).error(function(err) {
          callback(err);
        });
      }
    });
  }
};
