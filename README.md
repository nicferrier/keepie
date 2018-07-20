# Keepie keeps passwords

The idea of keepie is that it holds passwords for you and can hand
them out to services that are authorized to receive them.

The protocol is simple. A service requiring a password sends an
authorization request to Keepie for a password for a specified
service, with the receipt url as a the header:

```
X-Receipt-Url
```

for example, in curl terms:

```
curl -X POST \
     -H "X-Receipt-Url: http://localhost:5000/password" \
     http://localhost/keepie/myservice/request
```

The service we're requesting authorization for is called
`myservice`. 

We want to receive the password for it, if we're authorized, on the
url: `http://localhost:5000/password`

Keepie will accept the request with a 204 and then add it to its
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

## How to start Keepie

From the command line, simply:

```
node server.js
```

## How to extend Keepie

Keepie is very basic and only supports plain text password generation
but it is very extendable.

Call keepie's `boot` with the integer port as the first argument. A
second argument could be a config object.

Config objects have 2 functions:

* `get` which takes a service name and is expected to return a service config object
 * a service config object has
  * a `urls` array
  * a `password` string
  * a `type` string to define the type of the password
* `set` which takes a service name and a password and sets the password for the service
 * `set` is used in the case where the service config object has no password or a null password
 * this is done in the cases where keepie should generate the password
 
When keepie generates a password it uses the `type` property to decide
what sort of password it is and uses a lookup table called
`typeMapper` to decide how. The `typeMapper` maps type names to
functions used to generate them.

It's not possible to configure the type mapper right now. But a future
version will allow it.


## Keepie Postgresql example - pgBoot.js

Included is an example server called pgBoot.js.

When started this will attempt to talk to Keepie and, when it receives
a password, create a postgresql server.

pgBoot.js does several things:

* it creates a pg cluster (initdb) if one does not exist
 * the cluster has locale POSIX, or *C* in Postgresql convention
 * the cluster is owned by user `postgres`
 * the cluster has encoding UTF8
* it allocates a random port to the db every time it starts
* it starts the db in that cluster
* it changes the password of the `postgres` user
* it rewrites the `pg_hba` file and reloads the server config
 * the server now can only be accessed with the keepie provided password
* it applies the SQL it finds in a sql-scripts directory to the running DB


### What operating systems support pgBoot.js?

pgBoot.js has been tested on:

* Windows 10 with postgresql 10
* Ubuntu 16 with postgresql 10
* RedHat Enterprise Linux 7


### Using pgBoot.js on the command line

You can use pgBoot.js to run your own Keepie based service with
Postgresql.

Run it as a server on its own:

```
node pgBoot.js 5000
```

will start a server on port 5000 routing its own service and a keepie
service which will authorize itself and hand out the password
"Secret1234567!".

It will boot its own Postgres using whatever method it can find, or
die.

### Using pgBoot.js as a module

You still have to use its server:

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

pgBoot.js also provides an event interface. This is the only way to
receive the connection detail from Keepie right now:

```
const pgBoot = require("keepie").pgBoot;

pgBoot.events.on("dbUp", async dbDetails => {
   let { pgPool } = dbDetails;
   let client = pgPool.connect();
   try {
      let result = await client.query("SELECT now();");
      return result;
   }
   finally {
      client.release();
   }
});
```

The events that pgBoot.js sends are:

* `sqlFile` - a sql file is being executed, passed the filename of the file
* `dbUp` - the db has been started, the pg pool to connect is a parameter


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
* `serviceName` - the authorization name, the service to request authorization for
* `pgBinDir` - a place where we'll find the pg binaries, we'll try to guess if not specified
* `appCallback` - a function, called with the express app so you can configure routes.
* `listenAddress` - `undefined` or an address to listen on, eg: `"localhost"`, see [express](https://expressjs.com/en/4x/api.html#app.listen) for more details.
* `listenerCallback` - a function, called with the listener address so you can enquire of the listener.
* `sqlScriptsDir` - a path to a directory containing SQL scripts to initialize the db
* `dbDir` - a path to where to store the db files
* `pgPoolConfig` - see [pgPool](https://node-postgres.com/api/pool) about config for the postgres connection pool

*Note: in `pgPoolConfig` authentication or host details are ignored.*

### How does pgBoot.js guess where the PG binaries are?

pgBoot.js is looking for `initdb` and `postgresql` binaries and uses
some tricks to find them on installations that I know.

The first trick is quite portable though, it looks in `PGBIN`
environment variable.

This variable can point to the bin directory where `initdb` and
`postgresql` binaries are. If the variable exists and points to a
thing then it is accepted as truth.


### SQL scripts and initialization

Through the option `sqlScriptsDir` pgBoot.js will apply sql scripts
whenever it starts the database.  

But pgBoot.js makes no attempt to keep versioning of these scripts so
*you must write these scripts to apply safely* to the database.

### A full end to end example of pgBoot.js

[See here](https://github.com/nicferrier/keepie/blob/master/pgbootdemo.js)
for a full example of how to configure and work with pgBoot.js to
start and use a Postgresql database.

### Command to create a pgBoot.js demo

Keepie includes a `makepg` command to create a simple demo keepie:

```
mkdir somejsdir
cd somejsdir
npm init -f
npm install keepie
node node_modules/keepie/server.js makepg
```

will make a `boot.js` that is an instance of a pgBoot.js. You can run
it with:

```
node boot.js
```

## Keepie and other databases?

Is Keepie postgresql specific? No. The only implementation for Keepie
behaviour is with Postgresql but any database would support it.

There is one caveat, Keepie works best when creating the database, so
that it can initially create the authentication and no human will ever
know. Keepie for MySql or ELK or Mongo would work well.

More traditional databases seem to have a manual installation process
where a human creates a password.

Keepie could support this mechanism if it had a UI to allow the
password to be entered once. Perhaps Keepie would then immediately
alter the password so the human no longer knows it, although break
glass scenarios should be considered too.

In this way, Keepie would look more like a traditional password store,
but not for humans.

Because of the organizational complexity around these sorts of
problems this is left as an exercise for the reader.
