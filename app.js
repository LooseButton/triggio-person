
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path')
  , sys = require('sys')
  , exec = require('child_process').exec
  , underscore = require('underscore')
  , yaml = require('js-yaml')
  , validDevices = require(process.cwd() + "/public/assets/devices.yml");

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);
app.get('/users', user.list);

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

var sendToTriggio = function(person, msg, sound) {
  console.log("Send to Triggio: " + person + " - " + msg + " - " + sound);
};

var parseConnections = function(callback) {
  var connectionsStart = false,
      connections = [];
  exec("sudo arp-scan -l", function(error, stdout, stderr) {
    // sys.puts(stdout);
    var lines = stdout.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (connectionsStart === true) {
        if (line.trim().length === 0) { break; }
        var vals = line.split('\t');
        var connectionData = {
          ip: vals[0],
          mac: vals[1],
          source: vals[2]
        };
        console.log(connectionData);
        connections.push(connectionData);
      }
      if (line.indexOf('Starting arp-scan') === 0) {
        connectionsStart = true;
      }
    }
    callback(connections);
  });
  return true;
};

// Store our initial connections
var initialConnections = [];

var connectedDevices = [];

var addConnectedDevice = function(device) {
  connectedDevices.push(device);
};

// Listen for new connections every 10 sec
var checkForNewConnections = function() {
  parseConnections(function(newConnections) {
    var newMacs = underscore.pluck(newConnections, 'mac');
    var oldMacs = underscore.pluck(initialConnections, 'mac');

    console.log('new macs: \n' + newMacs);
    console.log('old macs: \n' + oldMacs);

    // Get all new connections
    var diffConnections = underscore.difference(newMacs, oldMacs);

    if (diffConnections.length === 0) {
      console.log('No new devices found!');
    }

    // Send Triggio events to new mac addresses thats in our list
    validDevices.forEach(function(device) {
      if (underscore.contains(diffConnections, device['mac'])) {
        // Send notification to triggio that new person has arrived
        sendToTriggio(device['name'],
                      device['msg'],
                      device['soundName']);

        addConnectedDevice(device);
      }
    });

    initialConnections = newConnections;

    // Check again in 8 sec
    setTimeout(function() {
      checkForNewConnections();
    }, 8000);
  });
};

// Initialize our initial data
parseConnections(function(connections) {
  initialConnections = connections;

  // Populate already connected devices
  validDevices.forEach(function(device) {
    if (underscore.contains(initialConnections, device['mac'])) {
      connectedDevices.push(device);
    }
  });

  // TODO: Notify UI to update for connected devices

  // Start listening for new connections
  checkForNewConnections();
});

// sudo nmap -sP 192.168.0.0/24
// sudo nmap -sP 192.168.2.0/24

