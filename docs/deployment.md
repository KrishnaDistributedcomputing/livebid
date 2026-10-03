---
title: LiveBid deployment guide
description: Step-by-step source and container deployment instructions for LiveBid
ms.date: 2026-10-02
ms.topic: how-to
keywords:
  - next.js
  - docker
  - github container registry
  - azure container apps
estimated_reading_time: 12
---

## Choose a deployment path

| Goal                                  | Recommended path                     |
|---------------------------------------|--------------------------------------|
| Preview the source with managed CI/CD | Vercel                               |
| Run the existing production image     | Docker Compose                       |
| Host a public managed container       | Azure Container Apps                 |
| Host on a virtual machine             | Docker on a Linux host               |

The application listens on container port `3000`. The production image already
contains a Docker health check that calls `/api/health`.

## Prepare the repository

Run all validation commands from the repository root before deployment:

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm build
docker compose config
docker compose build
```

Commit and push validated changes:

```powershell
git status
git add --all
git commit -m "feat: update LiveBid application"
git push origin main
```

Never commit `.env` files, access tokens, registry passwords, or provider
credentials. The current prototype does not require runtime secrets.

## Deploy the source to Vercel

Vercel builds and hosts the Next.js source directly from GitHub.

1. Sign in at [Vercel](https://vercel.com/) with the GitHub account that can
   access the repository.

2. Select **Add New**, then select **Project**.

3. Import `KrishnaDistributedcomputing/livebid`.

4. Keep the detected framework preset set to **Next.js**.

5. Keep the root directory set to the repository root.

6. Leave environment variables empty for this prototype.

7. Select **Deploy**.

8. Open the assigned Vercel URL after the build finishes.

9. Verify the health endpoint by appending `/api/health` to that URL.

Every later push to `main` creates a production deployment. Pull requests
receive isolated preview deployments.

The same deployment can be created from a terminal:

```powershell
npm install --global vercel
vercel login
vercel
vercel --prod
```

## Publish the Docker image to GHCR

The workflow in `.github/workflows/publish-container.yml` builds the Dockerfile
on pushes to `main`, version tags, and manual runs. Pull requests build the
image without publishing it.

Published image names include:

```text
ghcr.io/krishnadistributedcomputing/livebid:latest
ghcr.io/krishnadistributedcomputing/livebid:main
ghcr.io/krishnadistributedcomputing/livebid:sha-<commit>
ghcr.io/krishnadistributedcomputing/livebid:<version-tag>
```

Check the workflow from GitHub CLI:

```powershell
gh run list --workflow "Publish container image"
gh run watch
```

GitHub packages can start with private visibility. To allow public container
hosts to pull the image without credentials:

1. Open the repository on GitHub.
2. Open **Packages**, then select the `livebid` package.
3. Open **Package settings**.
4. Under **Danger Zone**, select **Change visibility**.
5. Change the package to **Public** and confirm the package name.

Test the published image locally:

```powershell
docker pull ghcr.io/krishnadistributedcomputing/livebid:latest
docker run --detach `
  --name livebid-ghcr `
  --publish 3001:3000 `
  ghcr.io/krishnadistributedcomputing/livebid:latest
Invoke-RestMethod http://localhost:3001/api/health
docker rm --force livebid-ghcr
```

## Deploy the published image with Compose

The production Compose file pulls the published image instead of building it.

1. Clone the repository on the target host:

   ```bash
   git clone https://github.com/KrishnaDistributedcomputing/livebid.git
   cd livebid
   ```

2. Pull and start the current image:

   ```bash
   docker compose -f compose.production.yaml pull
   docker compose -f compose.production.yaml up --detach --wait
   ```

3. Verify the deployment:

   ```bash
   docker compose -f compose.production.yaml ps
   curl --fail http://127.0.0.1:3001/api/health
   ```

4. Review logs:

   ```bash
   docker compose -f compose.production.yaml logs --follow livebid
   ```

5. Update to a newly published image:

   ```bash
   docker compose -f compose.production.yaml pull
   docker compose -f compose.production.yaml up --detach --wait
   ```

6. Stop the deployment:

   ```bash
   docker compose -f compose.production.yaml down
   ```

Set a fixed image version and host port when repeatable releases are required:

```bash
export LIVEBID_IMAGE="ghcr.io/krishnadistributedcomputing/livebid:v1.0.0"
export LIVEBID_PORT="8080"
docker compose -f compose.production.yaml up --detach --wait
```

## Deploy on a Linux Docker host

Use these steps when the target server does not use Compose.

1. Install Docker Engine by following the official
   [Docker installation guide](https://docs.docker.com/engine/install/).

2. Pull a fixed image tag:

   ```bash
   docker pull ghcr.io/krishnadistributedcomputing/livebid:main
   ```

3. Start the container:

   ```bash
   docker run --detach \
     --name livebid \
     --publish 3001:3000 \
     --restart unless-stopped \
     ghcr.io/krishnadistributedcomputing/livebid:main
   ```

4. Verify the application from the server:

   ```bash
   docker ps --filter "name=livebid"
   curl --fail http://127.0.0.1:3001/api/health
   ```

5. Allow inbound TCP traffic to port `3001`, or place a TLS-enabled reverse
   proxy in front of the container.

For an internet-facing deployment, terminate TLS with a managed load balancer,
Caddy, Nginx, or another reverse proxy. Forward requests to
`http://127.0.0.1:3001`.

## Deploy to Azure Container Apps

These commands deploy the public GHCR image to a managed Azure endpoint. They
require an Azure subscription and the
[Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli).

1. Sign in and select the target subscription:

   ```powershell
   az login
   az account set --subscription "<subscription-name-or-id>"
   ```

2. Install or update the Container Apps extension:

   ```powershell
   az extension add --name containerapp --upgrade
   az provider register --namespace Microsoft.App
   az provider register --namespace Microsoft.OperationalInsights
   ```

3. Define deployment names. Change the location when required:

   ```powershell
   $ResourceGroup = "livebid-rg"
   $Location = "eastus"
   $Environment = "livebid-env"
   $AppName = "livebid-web"
   $Image = "ghcr.io/krishnadistributedcomputing/livebid:latest"
   ```

4. Create the resource group and Container Apps environment:

   ```powershell
   az group create `
     --name $ResourceGroup `
     --location $Location

   az containerapp env create `
     --name $Environment `
     --resource-group $ResourceGroup `
     --location $Location
   ```

5. Create the public application:

   ```powershell
   az containerapp create `
     --name $AppName `
     --resource-group $ResourceGroup `
     --environment $Environment `
     --image $Image `
     --ingress external `
     --target-port 3000 `
     --transport auto `
     --min-replicas 1 `
     --max-replicas 3 `
     --cpu 0.5 `
     --memory 1.0Gi
   ```

6. Retrieve the public hostname:

   ```powershell
   $Fqdn = az containerapp show `
     --name $AppName `
     --resource-group $ResourceGroup `
     --query properties.configuration.ingress.fqdn `
     --output tsv
   Write-Output "https://$Fqdn"
   ```

7. Verify the deployed health endpoint:

   ```powershell
   Invoke-RestMethod "https://$Fqdn/api/health"
   ```

8. Deploy a later image version:

   ```powershell
   az containerapp update `
     --name $AppName `
     --resource-group $ResourceGroup `
     --image "ghcr.io/krishnadistributedcomputing/livebid:sha-<commit>"
   ```

9. Remove all Azure resources when they are no longer needed:

   ```powershell
   az group delete --name $ResourceGroup --yes --no-wait
   ```

## Verify any deployment

Complete these checks after every release:

* The home page returns HTTP 200
* `/api/health` returns `status: ok`
* The primary product image loads
* Desktop and mobile layouts have no horizontal overflow
* A bid advances the displayed price before the sample auction ends
* Chat submission and primary navigation work
* Container logs contain no startup exceptions

Example PowerShell smoke test:

```powershell
$BaseUrl = "https://<deployment-host>"
$Home = Invoke-WebRequest $BaseUrl
$Health = Invoke-RestMethod "$BaseUrl/api/health"

if ($Home.StatusCode -ne 200 -or $Health.status -ne "ok") {
  throw "LiveBid deployment validation failed"
}
```

## Roll back a container deployment

Each GitHub Actions build creates an immutable commit tag. Roll back by
deploying the last known working `sha-<commit>` image instead of `latest`.

For Docker Compose:

```bash
export LIVEBID_IMAGE="ghcr.io/krishnadistributedcomputing/livebid:sha-<commit>"
docker compose -f compose.production.yaml up --detach --wait
```

For Azure Container Apps:

```powershell
az containerapp update `
  --name "livebid-web" `
  --resource-group "livebid-rg" `
  --image "ghcr.io/krishnadistributedcomputing/livebid:sha-<commit>"
```
