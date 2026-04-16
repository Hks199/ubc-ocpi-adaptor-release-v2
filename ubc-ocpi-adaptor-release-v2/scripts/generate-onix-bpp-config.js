const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const subscriberId = process.env.ONIX_BPP_SUBSCRIBER_ID || requireEnv('EV_CHARGING_UBC_BPP_ID');
const keyId = process.env.ONIX_BPP_KEY_ID || requireEnv('EV_CHARGING_UBC_UNIQUE_ID');
const signingPrivateKey = process.env.ONIX_BPP_SIGNING_PRIVATE_KEY || requireEnv('PRIVATE_KEY');
const signingPublicKey = requireEnv('ONIX_BPP_SIGNING_PUBLIC_KEY');
const registryMode = (process.env.ONIX_REGISTRY_MODE || 'dedi').trim().toLowerCase();
const registryUrl = requireEnv('ONIX_REGISTRY_URL');
const registryName = process.env.ONIX_REGISTRY_NAME || 'subscribers.beckn.one';

const registryPluginBlock = registryMode === 'dedi'
  ? `        registry:
          id: dediregistry
          config:
            url: ${registryUrl}
            registryName: ${registryName}
            retry_max: 3
            retry_wait_min: 100ms
            retry_wait_max: 500ms`
  : `        registry:
          id: registry
          config:
            url: ${registryUrl}
            retry_max: 3
            retry_wait_min: 100ms
            retry_wait_max: 500ms`;

const adapterYaml = `appName: "bpp-ev-charging"

log:
  level: debug
  destinations:
    - type: stdout
  contextKeys:
    - transaction_id
    - message_id
    - subscriber_id
    - module_id
    - parent_id

http:
  port: 8002
  timeout:
    read: 30
    write: 30
    idle: 30

pluginManager:
  root: /app/plugins

modules:
  - name: bppTxnReceiver
    path: /bpp/receiver/
    handler:
      type: std
      role: bpp
      subscriberId: ${subscriberId}
      httpClientConfig:
        maxIdleConns: 1000
        maxIdleConnsPerHost: 200
        idleConnTimeout: 300s
        responseHeaderTimeout: 5s
      plugins:
${registryPluginBlock}
        keyManager:
          id: simplekeymanager
          config:
            networkParticipant: ${subscriberId}
            keyId: ${keyId}
            signingPrivateKey: ${signingPrivateKey}
            signingPublicKey: ${signingPublicKey}
            encrPrivateKey: ${signingPrivateKey}
            encrPublicKey: ${signingPublicKey}
        cache:
          id: cache
          config:
            addr: redis-onix-bpp:6379
        signValidator:
          id: signvalidator
        router:
          id: router
          config:
            routingConfig: /app/config/bpp_receiver_routing.yaml
        middleware:
          - id: reqpreprocessor
            config:
              contextKeys: transaction_id,message_id,parent_id
              role: bpp
      steps:
        - validateSign
        - addRoute

  - name: bppTxnCaller
    path: /bpp/caller/
    handler:
      type: std
      role: bpp
      subscriberId: ${subscriberId}
      httpClientConfig:
        maxIdleConns: 1000
        maxIdleConnsPerHost: 200
        idleConnTimeout: 300s
        responseHeaderTimeout: 5s
      plugins:
${registryPluginBlock}
        keyManager:
          id: simplekeymanager
          config:
            networkParticipant: ${subscriberId}
            keyId: ${keyId}
            signingPrivateKey: ${signingPrivateKey}
            signingPublicKey: ${signingPublicKey}
            encrPrivateKey: ${signingPrivateKey}
            encrPublicKey: ${signingPublicKey}
        cache:
          id: cache
          config:
            addr: redis-onix-bpp:6379
        router:
          id: router
          config:
            routingConfig: /app/config/bpp_caller_routing.yaml
        signer:
          id: signer
        middleware:
          - id: reqpreprocessor
            config:
              contextKeys: transaction_id,message_id,parent_id
              role: bpp
      steps:
        - addRoute
        - sign
`;

const outputPath = path.join(projectRoot, 'onix-adaptor', 'config', 'onix-bpp', 'adapter.yaml');
fs.writeFileSync(outputPath, adapterYaml, 'utf8');
console.log(`Generated ${outputPath}`);
