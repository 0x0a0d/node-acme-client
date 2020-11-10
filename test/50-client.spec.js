/**
 * ACME client tests
 */

const { assert } = require('chai');
const { v4: uuid } = require('uuid');
const Promise = require('bluebird');
const rfc8555 = require('./rfc8555');
const acme = require('./../');

const directoryUrl = process.env.ACME_DIRECTORY_URL || acme.directory.letsencrypt.staging;
const capMetaTosField = !(('ACME_CAP_META_TOS_FIELD' in process.env) && (process.env.ACME_CAP_META_TOS_FIELD === '0'));
const capUpdateAccountKey = !(('ACME_CAP_UPDATE_ACCOUNT_KEY' in process.env) && (process.env.ACME_CAP_UPDATE_ACCOUNT_KEY === '0'));


describe('client', () => {
    let testPrivateKey;
    let testSecondaryPrivateKey;
    let testClient;
    let testAccount;
    let testAccountUrl;
    let testOrder;
    let testOrderWildcard;
    let testAuthz;
    let testAuthzWildcard;
    let testChallenges;

    const testDomain = 'example.com';
    const testDomainWildcard = `*.${testDomain}`;
    const testContact = `mailto:test-${uuid()}@nope.com`;


    /**
     * Fixtures
     */

    it('should generate a private key', async () => {
        testPrivateKey = await acme.forge.createPrivateKey();
        assert.isTrue(Buffer.isBuffer(testPrivateKey));
    });

    it('should create a second private key', async () => {
        testSecondaryPrivateKey = await acme.forge.createPrivateKey(2048);
        assert.isTrue(Buffer.isBuffer(testSecondaryPrivateKey));
    });


    /**
     * Initialize clients
     */

    it('should initialize client', () => {
        testClient = new acme.Client({
            directoryUrl,
            accountKey: testPrivateKey
        });
    });

    it('should produce a valid JWK', async () => {
        const jwk = await testClient.http.getJwk();

        assert.isObject(jwk);
        assert.strictEqual(jwk.e, 'AQAB');
        assert.strictEqual(jwk.kty, 'RSA');
    });


    /**
     * Terms of Service
     */

    it('should produce Terms of Service URL [ACME_CAP_META_TOS_FIELD]', async function() {
        if (!capMetaTosField) {
            this.skip();
        }

        const tos = await testClient.getTermsOfServiceUrl();
        assert.isString(tos);
    });

    it('should not produce Terms of Service URL [!ACME_CAP_META_TOS_FIELD]', async function() {
        if (capMetaTosField) {
            this.skip();
        }

        const tos = await testClient.getTermsOfServiceUrl();
        assert.isNull(tos);
    });


    /**
     * Create account
     */

    it('should refuse account creation without ToS [ACME_CAP_META_TOS_FIELD]', async function() {
        if (!capMetaTosField) {
            this.skip();
        }

        await assert.isRejected(testClient.createAccount());
    });

    it('should create an account', async () => {
        testAccount = await testClient.createAccount({
            termsOfServiceAgreed: true
        });

        rfc8555.account(testAccount);
        assert.strictEqual(testAccount.status, 'valid');
    });

    it('should produce an account URL', () => {
        testAccountUrl = testClient.getAccountUrl();
        assert.isString(testAccountUrl);
    });


    /**
     * Find existing account using secondary client
     */

    it('should throw when trying to find account using invalid account key', async () => {
        const client = new acme.Client({
            directoryUrl,
            accountKey: testSecondaryPrivateKey
        });

        await assert.isRejected(client.createAccount({
            onlyReturnExisting: true
        }));
    });

    it('should find existing account using account key', async () => {
        const client = new acme.Client({
            directoryUrl,
            accountKey: testPrivateKey
        });

        const account = await client.createAccount({
            onlyReturnExisting: true
        });

        rfc8555.account(account);
        assert.strictEqual(account.status, 'valid');
        assert.deepStrictEqual(account.key, testAccount.key);
    });


    /**
     * Account URL
     */

    it('should refuse invalid account URL', async () => {
        const client = new acme.Client({
            directoryUrl,
            accountKey: testPrivateKey,
            accountUrl: 'https://acme-staging-v02.api.letsencrypt.org/acme/acct/1'
        });

        await assert.isRejected(client.updateAccount());
    });

    it('should find existing account using account URL', async () => {
        const client = new acme.Client({
            directoryUrl,
            accountKey: testPrivateKey,
            accountUrl: testAccountUrl
        });

        const account = await client.createAccount({
            onlyReturnExisting: true
        });

        rfc8555.account(account);
        assert.strictEqual(account.status, 'valid');
        assert.deepStrictEqual(account.key, testAccount.key);
    });


    /**
     * Update account contact info
     */

    it('should update account contact info', async () => {
        const data = { contact: [testContact] };
        const account = await testClient.updateAccount(data);

        rfc8555.account(account);
        assert.strictEqual(account.status, 'valid');
        assert.deepStrictEqual(account.key, testAccount.key);
        assert.isArray(account.contact);
        assert.include(account.contact, testContact);
    });


    /**
     * Change account private key
     */

    it('should change account private key [ACME_CAP_UPDATE_ACCOUNT_KEY]', async function() {
        if (!capUpdateAccountKey) {
            this.skip();
        }

        await testClient.updateAccountKey(testSecondaryPrivateKey);

        const account = await testClient.createAccount({
            onlyReturnExisting: true
        });

        rfc8555.account(account);
        assert.strictEqual(account.status, 'valid');
        assert.notDeepEqual(account.key, testAccount.key);
    });


    /**
     * Create new certificate order
     */

    it('should create new order', async () => {
        const data1 = { identifiers: [{ type: 'dns', value: testDomain }] };
        const data2 = { identifiers: [{ type: 'dns', value: testDomainWildcard }] };

        testOrder = await testClient.createOrder(data1);
        testOrderWildcard = await testClient.createOrder(data2);

        [testOrder, testOrderWildcard].forEach((item) => {
            rfc8555.order(item);
            assert.strictEqual(item.status, 'pending');
        });
    });


    /**
     * Get status of existing certificate order
     */

    it('should get existing order', async () => {
        await Promise.map([testOrder, testOrderWildcard], async (existing) => {
            const result = await testClient.getOrder(existing);

            rfc8555.order(result);
            assert.deepStrictEqual(existing, result);
        });
    });


    /**
     * Get identifier authorization
     */

    it('should get identifier authorization', async () => {
        const orderAuthzCollection = await testClient.getAuthorizations(testOrder);
        const wildcardAuthzCollection = await testClient.getAuthorizations(testOrderWildcard);

        [orderAuthzCollection, wildcardAuthzCollection].forEach((collection) => {
            assert.isArray(collection);
            assert.isNotEmpty(collection);

            collection.forEach((authz) => {
                rfc8555.authorization(authz);
                assert.strictEqual(authz.status, 'pending');
            });
        });

        testAuthz = orderAuthzCollection.pop();
        testAuthzWildcard = wildcardAuthzCollection.pop();
        testChallenges = testAuthz.challenges.concat(testAuthzWildcard.challenges);

        testChallenges.forEach((item) => {
            rfc8555.challenge(item);
            assert.strictEqual(item.status, 'pending');
        });
    });


    /**
     * Generate challenge key authorization
     */

    it('should get challenge key authorization', async () => {
        await Promise.map(testChallenges, async (item) => {
            const keyAuth = await testClient.getChallengeKeyAuthorization(item);
            assert.isString(keyAuth);
        });
    });


    /**
     * Deactivate identifier authorization
     */

    it('should deactivate identifier authorization', async () => {
        await Promise.map([testAuthz, testAuthzWildcard], async (item) => {
            const authz = await testClient.deactivateAuthorization(item);

            rfc8555.authorization(authz);
            assert.strictEqual(authz.status, 'deactivated');
        });
    });


    /**
     * Deactivate account
     */

    it('should deactivate the test account', async () => {
        const data = { status: 'deactivated' };
        const account = await testClient.updateAccount(data);

        rfc8555.account(account);
        assert.strictEqual(account.status, 'deactivated');
    });


    /**
     * Verify that no new orders can be made
     */

    it('should not allow new orders', async () => {
        const data = {
            identifiers: [{ type: 'dns', value: 'nope.com' }]
        };

        await assert.isRejected(testClient.createOrder(data));
    });
});
