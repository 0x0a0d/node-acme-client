/**
 * Axios instance
 */

const axios = require('axios');
const adapter = require('axios/lib/adapters/http');
const http = require('http');
const https = require('https');
const pkg = require('./../package.json');


/**
 * Instance
 */

const instance = axios.create({
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true })
});

/* Default User-Agent */
instance.defaults.headers.common['User-Agent'] = `node-${pkg.name}/${pkg.version}`;

/* Default ACME settings */
instance.defaults.acmeSettings = {
    httpChallengePort: 80,
    bypassCustomDnsResolver: false
};


/**
 * Explicitly set Node as default HTTP adapter
 *
 * https://github.com/axios/axios/issues/1180
 * https://stackoverflow.com/questions/42677387
 */

instance.defaults.adapter = adapter;


/**
 * Export instance
 */

module.exports = instance;
