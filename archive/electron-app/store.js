const Store = require('electron-store');

const store = new Store({
  encryptionKey: 'legaltrack-local-key',
  schema: {
    auth_token: { type: 'string', default: '' },
    user_email: { type: 'string', default: '' },
    user_name: { type: 'string', default: '' },
    is_paused: { type: 'boolean', default: false },
    has_run_before: { type: 'boolean', default: false }
  }
});

module.exports = store;

