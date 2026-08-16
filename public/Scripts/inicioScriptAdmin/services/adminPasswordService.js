import { apiFetch, apiJson } from '../../api.js';
import Password from '../../../models/passwordsAdmin.js';

export async function fetchPasswordById(accountId, passwordId) {
    const url = `/a/${encodeURIComponent(accountId)}/${encodeURIComponent(passwordId)}`;
    const { ok, data } = await apiJson(url);
    if (!ok) throw new Error(data.error || 'No se pudo obtener la contraseña');
    return new Password(data.data);
}

export async function createPasswordForAccount({ accountId, name, password, description, updateablebyclient, visibility }) {
    const { ok, data } = await apiJson(`/a/${encodeURIComponent(accountId)}`, {
        method: 'POST',
        body: { name, password, description, updateablebyclient, visibility },
    });
    if (!ok) throw new Error(data.error || data.message || 'Error al crear contraseña');
    return data;
}

export async function updatePasswordAttribute(accountId, passwordId, attribute, value) {
    const url = `/a/${encodeURIComponent(accountId)}/${encodeURIComponent(passwordId)}?attribute=${encodeURIComponent(attribute)}`;
    const { ok, data } = await apiJson(url, {
        method: 'PUT',
        body: { value },
    });
    if (!ok) throw new Error(data.error || data.message || 'Error al actualizar');
    return data;
}

export async function deletePassword(accountId, passwordId) {
    const url = `/a/${encodeURIComponent(accountId)}/${encodeURIComponent(passwordId)}`;
    const response = await apiFetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return true;
}
