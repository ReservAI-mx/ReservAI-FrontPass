export default class Password {
    constructor({ id, name, description, password, updateableByClient, updateablebyclient, visibility, account_id }) {
        this.id = id;
        this.name = name ?? "";
        this.description = description;
        this.password = password;
        // Acepta ambos nombres y fuerza a booleano
        this.updateableByClient = (
            typeof updateableByClient !== "undefined"
                ? (updateableByClient === true || updateableByClient === "true")
                : (updateablebyclient === true || updateablebyclient === "true")
        ) || false;
        this.visibility = visibility;
        this.account_id = account_id;
    }

    static fromJson(jsonResponse) {
        if (jsonResponse && jsonResponse.data) {
            return new Password({
                id: jsonResponse.data.id,
                name: jsonResponse.data.name,
                description: jsonResponse.data.description,
                password: jsonResponse.data.password,
                updateableByClient: jsonResponse.data.updateableByClient,
                updateablebyclient: jsonResponse.data.updateablebyclient,
                visibility: jsonResponse.data.visibility,
                account_id: jsonResponse.data.account_id
            });
        }
        return null;
    }

    forClient() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            password: this.password
        };
    }

    forAdmin() {
        return { ...this };
    }

    toHTML() {
    const safeName = escapeHtml(this.name || 'Sin nombre');
    const safeDescription = escapeHtml(this.description || '');
    const safePasswordAttr = escapeHtmlAttr(this.password || '');

    return `
        <div class="password-details">
        
            <div class="password-info">
                <div class="password-name">
                    <strong>Nombre:</strong> <span class="editable-name">${safeName}</span>
                    <span class="edit-icon" role="button" tabindex="0" title="Editar nombre"> <i class="fas fa-pen-to-square"></i></span>
                </div>
                <div class="password-field">
                    <div class="password-value-container">
                        <strong>Contraseña:</strong>
                        <div class="password-display">
                            <div class="password-text" data-password="${safePasswordAttr}">*************</div>
                            <span class="edit-icon" role="button" tabindex="0" title="Editar contraseña"><i class="fas fa-pen-to-square"></i></span>
                            <div class="password-actions">
                                <button class="toggle-password-btn" type="button" title="Mostrar contraseña">
                                    <i class="fas fa-eye eye-icon"></i>
                                </button>
                                <button class="copy-password-btn" type="button" title="Copiar contraseña">
                                    <i class="fas fa-copy copy-icon"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="password-description">
                    <strong>Descripción:</strong> <span class="editable-description">${safeDescription}</span>
                     <span class="edit-icon" role="button" tabindex="0" title="Editar descripción"><i class="fas fa-pen-to-square"></i></span>
                </div>
            </div>
        </div>
    `;
    }

}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeHtmlAttr(value) {
    return escapeHtml(value);
}