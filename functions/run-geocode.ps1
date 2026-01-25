$env:DATABASE_URL = "postgresql://postgres:VLZjTRNrCwKuUnulHScWYaPiXKLYxCJm@caboose.proxy.rlwy.net:37316/railway"
Set-Location $PSScriptRoot
node geocode-all-properties.js *> geocoding.log
