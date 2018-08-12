# Keepie keeps passwords

The idea of keepie is that it holds passwords for you and can hand
them out to services that are authorized to receive them thus making
the storage of the password secure. It's easier to change the password
(because it can be reissued) and it's a good way to build in
credential security from the start. 

Alternatives to Keepie are inspiring; including:

- encrypting secrets in increasingly baroque but futile ways
- or just typing in a secret when you deploy the service.

## Where can I get it

Head over to [npm land](https://www.npmjs.com/package/keepie) to get
Keepie.

## How does Keepie work?

The protocol is simple. A service requiring a password sends an
authorization request to Keepie for a password for a specified
service, with the receipt url as a the header:

```
X-Receipt-Url
```

for example, in curl terms:

```sh
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

```sh
curl -F "password=somesecret" \
     -F "service=myservice" \
     http://localhost:5000/password
```

Keepie is extremely simple and only does a very small, simple
thing. But it enables services that want to own things that need
credentials (like databases) to operate in a disposable way.

## How to start Keepie

From the command line, simply:

```sh
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

pgBoot is quite powerful and many layered so it has it's own [doc file](PgBoot.md).


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
