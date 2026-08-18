class SessionStorageManager {
  static keys = {
    accountType: 'account_type',
    accountName: 'account_name',
    tokenType: 'token_type',
    verified: 'verified',
    twofaenabled: 'twofaenabled',
  };

  static setItem(key, value) {
    sessionStorage.setItem(key, value);
  }

  static getItem(key) {
    return sessionStorage.getItem(key);
  }

  static removeItem(key) {
    sessionStorage.removeItem(key);
  }

  static saveSession({ account_type, account_name, token_type, verified, twofaenabled }) {
    if (account_type != null) this.setItem(this.keys.accountType, account_type);
    if (account_name != null) this.setItem(this.keys.accountName, account_name);
    if (token_type != null) this.setItem(this.keys.tokenType, token_type);
    if (verified != null) this.setItem(this.keys.verified, String(verified));
    if (twofaenabled != null) this.setItem(this.keys.twofaenabled, String(twofaenabled));
  }

  static getSession() {
    return {
      account_type: this.getItem(this.keys.accountType),
      account_name: this.getItem(this.keys.accountName),
      token_type: this.getItem(this.keys.tokenType),
      verified: this.getItem(this.keys.verified),
      twofaenabled: this.getItem(this.keys.twofaenabled),
    };
  }

  static clearSession() {
    Object.values(this.keys).forEach((key) => sessionStorage.removeItem(key));
  }
}

export default SessionStorageManager;
