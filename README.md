# Dispatch
<img align="right" width="70" height="70" src="https://upload.wikimedia.org/wikipedia/commons/0/0a/Deputy_Dispatch_logo.svg" alt="Deputy Dispatch logo">

Dispatch is a Node.js+Express webserver that exposes API endpoints that processes
large masses of data from Wikimedia wikis for easier consumption by
[Deputy](https://github.com/ChlodAlejandro/deputy). It is meant to centralize
and optimize the gathering and processing of bulk data such that numerous
users of Deputy do not individual make taxing requests on Wikimedia servers.

Dispatch optionally allows access to restricted data (such as deleted revision
summaries, etc.) by logging in with a Wikimedia account, allowing better
revision visibility. Data accessed by Deputy through this method is isolated
from those without the relevant rights to prevent inadvertently leaking
protected data.

## API versioning

Deputy versions `0.2.2` and prior used a revision endpoint provided by
[Zoomiebot](https://github.com/ChlodAlejandro/zoomiebot/blob/978eb4b05a/bot/api/deputy/v1/revisions.ts).
This version is backwards compatible with API version `v1`.

* v1 (`/v1/`) – *current version*

## Contributing

Please clone with submodules (`--recursive`/`--recurse-submodules`) to ensure that
[Dispatch types](https://github.com/ChlodAlejandro/deputy-dispatch-types)
are also cloned alongside the repo.

If you forgot to clone with submodules, just run the following commands to
initialize the submodule for types:
```bash
git submodule update --init --recursive
```

You'll need a live connection to the Toolforge Replica DBs to work on Dispatch
smoothly. You can use the following command to forward the ports automagically.

```bash
ssh -L 4711:enwiki.web.db.svc.wikimedia.cloud:3306 dev.toolforge.org -Nv
```

Dispatch will check if it's on Toolforge and use the appropriate port (`tcp/3306`)
if so. Otherwise, it will check the port above (`tcp/4711`) first. Note that SQL
credentials are still required, and Dispatch will attempt to look for them on:
* the user's home directory (`~/replica.my.cnf`)
* the current working directory (`$(PWD)/replica.my.cnf`)
  * The current working directory is the `www/js` folder in the Dispatch tool's
    home, as this is where Dispatch resides.
* environment variables
  * `DISPATCH_TOOLSDB_USER` for the username
  * `DISPATCH_TOOLSDB_PASS` for the password
  * `DISPATCH_TOOLSDB_HOST` for the ToolsDB SQL server host
    * This is set to the correct value when running on Toolforge. If `NODE_ENV` == "development",
      it will be set to `localhost` by default.
  * `DISPATCH_TOOLSDB_HOST_{DBNAME}` for the Replicas 
    SQL server host, where `{DBNAME}` is the database name in uppercase (e.g. `ENWIKI`)
    * This is set to the correct value when running on Toolforge. If `NODE_ENV` == "development",
      it will be set to `localhost` by default.
  * `DISPATCH_TOOLSDB_PORT` for the SQL server port
    * This is set to the correct value when running on Toolforge. If `NODE_ENV` == "development",
      it will look for `DISPATCH_TOOLSDB_PORT_{DBNAME}`.

## Licensing

```
Copyright 2022 Chlod Aidan Alejandro

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

       https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
