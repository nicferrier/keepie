# Keepie keeps passwords

The idea of keepie is that it holds passwords for you and can hand
them out to services that are authorized to receive them.

The protocol is simple. A service requiring a password sends a request
to Keepie with the receipt url as a the header:

```
X-Receipt-Url
```

for example, in curl terms:

```
curl -X POST \
     -H "X-Receipt-Url: http://localhost:5000/password" \
     http://localhost/keepie/myservice/request
```

Keepie will accept the request with a 204 and then add it to it's
requests queue.

The requests queue is processed constantly. Requests for passwords for
services are popped off the queue and the receipt URL is checked
against an internal list of authorized recipient URLs. 

If the requested receipt URL is included in the list of authorized
receipt URLs for the service then the service is sent a multipart POST
with the service name and the password, rather like this:

```
curl -F "password=somesecret" \
     -F "service=myservice" \
     http://localhost:5000/password
```

Keepie is extremely simple and only does a very small, simple
thing. But it enables services that want to own things that need
credentials (like databases) to operate in a disposable way.

## Keepie Postgresql example - pgBoot.js

Included is an example server called pgBoot.js.

When started this will attempt to talk to Keepie and, when it receives
a password, create a postgresql server.

There are many environment specific things about doing this, so
pgBoot.js assumes:

* the use of initdb to create the server locally
* the path of initdb as of ubuntu 16 postgresql-10 package
* a made up port is used

Lastly, one more convenience. The randomly chosen port is also written
to the file called "port" in the db config directory.

The pg "keepie" client does several things:

* it creates a pg cluster (initdb) if one does not exist
* it allocates a random port to the db every time it starts
* it starts the db in that cluster
* it applies the SQL it finds in the sql-scripts directory to the running DB


### Using pgBoot.js on the command line

You can use pgBoot.js to run your own Keepie based service with
Postgresql.

Run it as a server on it's own:

```
node pgBoot.js 5000
```

will start a server on port 5000 routing it's own service and a keepie
service which will authorize itself and hand out the password
"Secret1234567!".

It will boot it's own Postgres using whatever method it can find, or
die.

### Using pgBoot.js as a module

You still have to use it's server:

```
const pgBoot = require("keepie").pgBoot;

pgBoot.boot(8004, {
   appCallback: function (app) {
     app.get("/status", function (req, res) {
        res.json({ up: true });
     });
   }
});
```

pgBoot.js allows you to start the server and provide additional routes
through an `appCallback`.

There's also a `listenerCallback`. See customization below.


### Customizing pgBoot.js

If you run pgBoot.js you can pass several options to it to configure
it:

* `secretPath` - the path which your handler is using to receive
  requests from keepie; you will have to configure this in a keepie
  authorizing your service
* `keepieUrl` - the URL to send Keepie authorization requests to; this
  is also picked up from the environment variable KEEPIEURL though the
  option takes precedence; by default this is the local pgBoot server,
  which makes development easier
* `appCallback` - a function, called with the express app so you can configure routes.
* `listenerCallback` - a function, called with the listener address so you can enquire of the listener.
  
