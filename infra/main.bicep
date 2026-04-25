// =============================================================================
// AdLeak Shield — Azure Infrastructure (Bicep)
// infra/main.bicep
//
// WHAT IS BICEP?
// Bicep is a way to describe your Azure infrastructure as code — instead of
// clicking through the Azure portal, you write what you want in this file,
// and Azure creates everything for you. It's repeatable, version-controlled,
// and auditable.
//
// HOW TO DEPLOY:
//   az deployment group create \
//     --resource-group adleak-rg \
//     --template-file infra/main.bicep \
//     --parameters @infra/params.json
// =============================================================================

// Target scope — we're deploying into a resource group
targetScope = 'resourceGroup'

// =============================================================================
// PARAMETERS — values you supply at deploy time (see params.json)
// =============================================================================

@description('Short name prefix used in all resource names. Keep under 10 chars. e.g. "adleak"')
param projectName string = 'adleak'

@description('Azure region. UK South is closest to your UK users.')
@allowed(['uksouth', 'ukwest', 'westeurope'])
param location string = 'uksouth'

@description('SQL Server admin login name. Used once during setup, then replaced by Managed Identity.')
@secure()
param sqlAdminLogin string

@description('SQL Server admin password. Long, random string. Store in a password manager.')
@secure()
param sqlAdminPassword string

@description('Your owner email address — the AdLeak Shield admin account.')
param ownerEmail string

// =============================================================================
// VARIABLES — computed names for all resources
// =============================================================================

var sqlServerName   = '${projectName}-sql-server'
var sqlDatabaseName = '${projectName}-db'
var storageAccName  = replace('${projectName}stor', '-', '') // Storage names: no hyphens, max 24 chars
var queueName       = 'clicklog-ingest'
var keyVaultName    = '${projectName}-kv'
var functionsName   = '${projectName}-functions'
var staticWebAppName = '${projectName}-swa'

// =============================================================================
// 1. AZURE STATIC WEB APPS (SWA)
// Hosts the Next.js frontend. Free SSL certificate included.
// Global CDN means your UK users get fast load times worldwide.
// =============================================================================

resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: 'westeurope'
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    // We link the GitHub repo in the portal after deployment.
    // Leave buildProperties empty for manual GitHub Actions setup.
    buildProperties: {
      appLocation: '/'
      apiLocation: 'api'
      outputLocation: '.next'
    }
  }
  tags: {
    project: projectName
    environment: 'production'
  }
}

// =============================================================================
// 2. AZURE SQL SERVER
// The server is the container. The database (below) is what holds your data.
// =============================================================================

resource sqlServer 'Microsoft.Sql/servers@2023-02-01-preview' = {
  name: sqlServerName
  location: location
  properties: {
    administratorLogin: sqlAdminLogin
    administratorLoginPassword: sqlAdminPassword
    // Enforce TLS 1.3 — older versions are blocked at the server level
    minimalTlsVersion: '1.3'
    // Allow Azure services (our Functions) to connect
    publicNetworkAccess: 'Enabled'
  }
  tags: {
    project: projectName
  }
}

// Allow Azure-internal services to connect (Functions → SQL)
resource sqlFirewallAzureServices 'Microsoft.Sql/servers/firewallRules@2023-02-01-preview' = {
  parent: sqlServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// =============================================================================
// 3. AZURE SQL DATABASE (SERVERLESS, AUTO-PAUSE)
// This is the actual database. Serverless means it scales down to zero when
// not in use (after 1 hour idle). You only pay for what you use.
// Auto-pause means it wakes up automatically when a query arrives — that's
// the 30s cold-start we handle with the Skeleton Loaders and progress bar.
// =============================================================================

resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-02-01-preview' = {
  parent: sqlServer
  name: sqlDatabaseName
  location: location
  sku: {
    name: 'GP_S_Gen5_1'   // General Purpose, Serverless, Gen5, 1 vCore
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 1
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    autoPauseDelay: 60         // Auto-pause after 60 minutes of no activity
    minCapacity: json('0.5')         // Scale down to 0.5 vCores minimum (cheapest)
    zoneRedundant: false        // Not needed for MVP
    requestedBackupStorageRedundancy: 'Local' // Cheapest option for MVP
    // Transparent Data Encryption (TDE) is ON by default — no config needed
  }
  tags: {
    project: projectName
  }
}

// =============================================================================
// 4. AZURE STORAGE ACCOUNT + QUEUE
// The "catcher's mitt" — click data lands here before the DB wakes up.
// Queue Storage is essentially an indestructible message queue: data goes in,
// nothing is lost even if the DB is asleep, and the Worker drains it when ready.
// =============================================================================

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccName
  location: location
  sku: {
    name: 'Standard_LRS'  // Locally Redundant Storage — cheapest, fine for MVP
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'        // Enforce TLS on storage access
    allowBlobPublicAccess: false        // No public access to any blobs
    supportsHttpsTrafficOnly: true      // Redirect all HTTP to HTTPS
  }
  tags: {
    project: projectName
  }
}

// Create the queue that the HTTP Function writes to
resource clickQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01' = {
  name: '${storageAccount.name}/default/${queueName}'
  // Note: Azure Queue messages expire after 7 days by default.
  // Our Worker drains this within seconds/minutes, so this is not a concern.
}

// =============================================================================
// 5. AZURE KEY VAULT
// Stores secrets: Stripe API key, Resend API key.
// Functions never read secrets from environment variables — they read from here.
// Access is controlled by the Managed Identity (see Functions section below).
// =============================================================================

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'  // Standard tier is sufficient — Premium adds HSM
    }
    tenantId: subscription().tenantId
    // enableRbacAuthorization: use Azure RBAC roles instead of legacy access policies
    enableRbacAuthorization: true
    // Soft-delete: accidental deletions are recoverable for 90 days
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    // Purge protection: prevents permanent deletion during soft-delete period
    enablePurgeProtection: true
  }
  tags: {
    project: projectName
  }
}

// =============================================================================
// 6. AZURE FUNCTIONS (FLEX CONSUMPTION)
// Where your server-side logic runs. Flex Consumption = serverless compute.
// It scales to zero when idle and scales up instantly when traffic arrives.
// System-Assigned Managed Identity is enabled so it can connect to SQL and
// Key Vault without any passwords.
// =============================================================================

// Functions needs a storage account for its own internal use (logs, state)
resource functionStorageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: replace('${projectName}fncstor', '-', '')
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionsName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: flexPlan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${functionStorageAccount.properties.primaryEndpoints.blob}deployments'
          authentication: {
            type: 'StorageAccountConnectionString'
            storageAccountConnectionStringName: 'AzureWebJobsStorage'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 10
        instanceMemoryMB: 2048
      }
      runtime: {
        name: 'node'
        version: '20'
      }
    }
    siteConfig: {
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${functionStorageAccount.name};AccountKey=${functionStorageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'DATABASE_SERVER'
          value: '${sqlServerName}${environment().suffixes.sqlServerHostname}'
        }
        {
          name: 'DATABASE_NAME'
          value: sqlDatabaseName
        }
        {
          name: 'QUEUE_STORAGE_ACCOUNT'
          value: storageAccName
        }
        {
          name: 'QUEUE_NAME'
          value: queueName
        }
        {
          name: 'KEY_VAULT_URI'
          value: keyVault.properties.vaultUri
        }
        {
          name: 'OWNER_EMAIL'
          value: ownerEmail
        }
      ]
    }
  }
  tags: {
    project: projectName
  }
}

// Flex Consumption plan — serverless, scales to zero
resource flexPlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: '${projectName}-flex-plan'
  location: location
  sku: {
    name: 'FC1'    // FC1 = Flex Consumption tier
    tier: 'FlexConsumption'
  }
  kind: 'functionapp'
  properties: {
    reserved: true  // Required for Linux
  }
}

// =============================================================================
// RBAC: Grant the Functions Managed Identity access to Key Vault
// Role: Key Vault Secrets User — read-only access to secrets
// =============================================================================

var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource functionsKeyVaultAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, functionApp.id, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// =============================================================================
// OUTPUTS — these values are printed after deployment.
// Copy them into your environment configuration.
// =============================================================================

output staticWebAppHostname string = staticWebApp.properties.defaultHostname
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName
output sqlDatabaseName string = sqlDatabase.name
output storageAccountName string = storageAccount.name
output queueName string = queueName
output keyVaultUri string = keyVault.properties.vaultUri
output functionAppName string = functionApp.name
// The Managed Identity principal ID — needed to create the SQL user in 02_users.sql
output functionsManagedIdentityPrincipalId string = functionApp.identity.principalId
