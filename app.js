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
  , __ = require('underscore')
  , rest = require('restler')
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


// Store our initial connections
var initialConnections = [],
    connectedDevices = [],
    TRIGGIO_AUTH_TOKEN = 'NzM3ZTcxODQ5MWRiMTYwNTA4OGRjMTY2',
    MINIMAL_TIME_DIFFERENCE = 10 * 60 * 1000;

var sendToTriggio = function(person, msg, sound) {
  console.log("Send to Triggio: " + person + " - " + msg + " - " + sound);
  var data = {
    'source': person,
    'sound_id': sound,
    'type': person,
    'message': msg
  };
  rest.post('http://triggio.meteor.com/api/events', {
    data: JSON.stringify(data),
    headers: {
      'Accept': '*/*',
      'content-type': 'text/plain',
      'X-Auth-Token': TRIGGIO_AUTH_TOKEN
    }
  }).on('complete', function(data, response) {
    console.log('Triggio Msg Successfully Sent!');
  });
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

var addConnectedDevice = function(device) {
  // Add this new device only if it is connect longer than minimal time
  now = new Date();
  deviceFound = false;
  for (var i = connectedDevices.length - 1; i >= 0; i--) {
    targetDevice = connectedDevices[i];
    if (targetDevice['address'] === device['address']) {
      deviceFound = true;
      if (now - targetDevice['connected_time'] >= MINIMAL_TIME_DIFFERENCE) {
        targetDevice['connected_time'] = now;
        return true;
      }
    }
  }

  // Add this device if it was never connected
  if (!deviceFound) {
    device['connected_time'] = now;
    connectedDevices.push(device);
    return true;
  }

  // Device found but didn't pass minimal connected time
  return false;
};

// Listen for new connections every 10 sec
var checkForNewConnections = function() {
  parseConnections(function(newConnections) {
    var newMacs = __.pluck(newConnections, 'mac');
    var oldMacs = __.pluck(initialConnections, 'mac');

    console.log('new macs: \n' + newMacs);
    console.log('old macs: \n' + oldMacs);

    // Get all new connections
    var diffConnections = __.difference(newMacs, oldMacs);

    if (diffConnections.length === 0) {
      console.log('No new devices found!');
    }else {
      console.log('new devices found!');
      console.log("Diff connections:");
      console.log(diffConnections);

      // Send Triggio events to new mac addresses thats in our list
      validDevices.forEach(function(device) {
        if (__.contains(diffConnections, device['address'])) {

          // Try to add connected device, if successfully send triggio event
          if (addConnectedDevice(device)) {
            sendToTriggio(device['name'],
                        device['msg'],
                        device['soundName']);
          }
        }
      });
    }

    initialConnections = __.clone(newConnections);

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
  initialMacs = __.pluck(initialConnections, 'mac');
  now = new Date();
  validDevices.forEach(function(device) {
    if (__.contains(initialMacs, device['address'])) {
      device['created_time'] = now;
      connectedDevices.push(device);
    }
  });

  // TODO: Notify UI to update for connected devices

  // Start listening for new connections
  checkForNewConnections();
});

// sudo nmap -sP 192.168.0.0/24
// sudo nmap -sP 192.168.2.0/24

