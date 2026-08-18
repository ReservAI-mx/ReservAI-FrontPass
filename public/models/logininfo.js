
export default class LoginInfo {
    constructor(email, password) {
        if (!this.validateEmail(email) || !this.validatePassword(password)) {
            throw new Error("Información inválida");
        }
        this.email = this.sanitizeEmail(email);
        this.password = this.sanitizePassword(password);
    }

    validateEmail(email) {
        if (!email || typeof email !== 'string') return false;
        const trimmed = email.trim();
        if (trimmed.length < 3 || trimmed.length > 254) return false;
        const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return regex.test(trimmed);
    }

    sanitizeEmail(email) {
        return email.trim();
    }

    validatePassword(password) {
        if (!password || typeof password !== 'string') return false;
        return this.sanitizePassword(password) !== '';
    }

    sanitizePassword(password) {
        return password.trim();
    }

    toJSON() {
        return {
            email: this.email,
            password: this.password
        };
    }

    async login() {
        const { apiJson } = await import('../Scripts/api.js');
        const { ok, status, data } = await apiJson('/account', {
            method: 'POST',
            body: this.toJSON(),
        });
        if (!ok) {
            throw new Error(`Error ${status}: ${data.error || data.message || 'login failed'}`);
        }
        return data;
    }
}