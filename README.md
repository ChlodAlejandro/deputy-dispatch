# Dispatch
<img align="right" width="70" height="70" src="https://upload.wikimedia.org/wikipedia/commons/2/2b/Deputy_logo.svg" alt="Deputy logo">

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