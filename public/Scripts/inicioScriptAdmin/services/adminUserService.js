import { apiFetch, apiJson } from '../../api.js';

export async function fetchAccountById(accountId, page = 1, search = '') {
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);
    const { ok, data } = await apiJson(`/a/${encodeURIComponent(accountId)}?${params.toString()}`);
    if (!ok) throw new Error('No se pudo obtener la cuenta');
    return data;
}

export async function fetchAccounts({ page = 1, search = '' }) {
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);
    const { ok, status, data } = await apiJson(`/a?${params.toString()}`);
    if (!ok) throw new Error(`Error ${status}`);
    return data;
}

export async function deleteAccount(accountId) {
    const response = await apiFetch(`/account/${encodeURIComponent(accountId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json().catch(() => ({}));
}
