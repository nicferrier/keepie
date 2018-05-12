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
