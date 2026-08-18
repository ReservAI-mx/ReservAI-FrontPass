import { apiFetch, apiJson } from '../../api.js';
import Password from '../../../models/passwords.js';

export async function fetchPasswords(page = 1, search = '') {
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);
    const { ok, status, data } = await apiJson(`/p?${params.toString()}`);
    if (!ok) throw new Error(`Error al obtener contraseñas: ${status}`);
    return data;
}

export async function fetchPasswordById(id) {
    const response = await apiFetch(`/p/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error(`Error ${response.status}: no se pudo obtener la contraseña`);
    const data = await response.json();
    return Password.fromJson(data);
}

export async function createPassword({ name, password, description }) {
    const { ok, data } = await apiJson('/p', {
        method: 'POST',
        body: { name, password, description },
    });
    if (!ok) throw new Error(data.message || data.error || 'Error al crear contraseña');
    return data;
}

export async function updatePasswordAttribute(id, attribute, value) {
    const { ok, data } = await apiJson(`/p/${encodeURIComponent(id)}?attribute=${encodeURIComponent(attribute)}`, {
        method: 'PUT',
        body: { value },
    });
    if (!ok) throw new Error(data.error || data.message || 'Error al actualizar');
    return data;
}
