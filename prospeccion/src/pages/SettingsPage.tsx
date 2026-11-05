import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteCategory, errorMessage, getCategories, saveCategory } from '../api';
import { ConfirmDialog, EmptyState, FallbackBanner, Loading } from '../components/ui';
import { slugify, splitList } from '../format';
import { MOCK_CATEGORIES } from '../mock';
import type { Category } from '../types';

type FormState = { name: string; slug: string; types: string; terms: string; active: boolean };

const EMPTY_FORM: FormState = { name: '', slug: '', types: '', terms: '', active: true };

export function SettingsPage() {
  const qc = useQueryClient();
  const categoriesQ = useQuery({ queryKey: ['categories', 'all'], queryFn: () => getCategories(false), retry: false });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [slugEdited, setSlugEdited] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);
  const categories = categoriesQ.data ?? (categoriesQ.isError ? MOCK_CATEGORIES : []);
  const locked = categoriesQ.isError;

  const save = useMutation({
    mutationFn: () => saveCategory(editing?.id ?? null, {
      name: form.name.trim(),
      slug: form.slug.trim() || slugify(form.name),
      google_place_types: splitList(form.types),
      search_terms: splitList(form.terms),
      is_active: form.active,
    }),
    onSuccess: async () => {
      setForm(EMPTY_FORM);
      setEditing(null);
      setSlugEdited(false);
      setError(null);
      await qc.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: async () => {
      setPendingDelete(null);
      await qc.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const toggle = useMutation({
    mutationFn: (category: Category) => saveCategory(category.id, {
      name: category.name,
      slug: category.slug,
      google_place_types: category.google_place_types,
      search_terms: category.search_terms,
      is_active: !category.is_active,
    }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['categories'] }); },
    onError: (err) => setError(errorMessage(err)),
  });

  function beginEdit(category: Category) {
    setEditing(category);
    setSlugEdited(true);
    setForm({
      name: category.name,
      slug: category.slug,
      types: category.google_place_types.join(', '),
      terms: category.search_terms.join(', '),
      active: category.is_active,
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    if (!form.name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (splitList(form.types).length === 0 && splitList(form.terms).length === 0) {
      setError('Indica tipos de Google o términos de búsqueda.');
      return;
    }
    setError(null);
    save.mutate();
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Giros</h1>
          <p className="lede">Categorías que la búsqueda usa en el servidor. Aquí no se guardan llaves de API.</p>
        </div>
      </header>
      {categoriesQ.isError ? (
        <FallbackBanner
          message="No se pudo cargar el catálogo. El formulario queda bloqueado."
          onRetry={() => categoriesQ.refetch()}
          retrying={categoriesQ.isFetching}
        />
      ) : null}
      {error ? <p className="banner err">{error}</p> : null}
      <div className="workspace">
        <div className="stack">
          {categoriesQ.isPending ? <Loading label="Cargando giros…" /> : null}
          {!categoriesQ.isPending && categories.length === 0 ? (
            <EmptyState title="Sin giros" body="Crea el primero para poder buscar en el mapa." />
          ) : null}
          {categories.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Nombre</th><th>Tipos Google</th><th>Términos</th><th>Estado</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.id}>
                      <td><strong>{category.name}</strong><div className="muted">{category.slug}</div></td>
                      <td>{category.google_place_types.join(', ') || '—'}</td>
                      <td>{category.search_terms.join(', ') || '—'}</td>
                      <td><span className={category.is_active ? 'badge fit-high' : 'badge'}>{category.is_active ? 'Activo' : 'Inactivo'}</span></td>
                      <td className="actions">
                        <button type="button" className="ghost" disabled={locked} onClick={() => beginEdit(category)}>Editar</button>
                        <button type="button" className="ghost" disabled={locked || toggle.isPending} onClick={() => toggle.mutate(category)}>
                          {category.is_active ? 'Desactivar' : 'Activar'}
                        </button>
                        <button type="button" className="danger" disabled={locked} onClick={() => setPendingDelete(category)}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
        <form className="panel" onSubmit={onSubmit}>
          <h2>{editing ? 'Editar giro' : 'Nuevo giro'}</h2>
          <label className="field">Nombre
            <input
              value={form.name}
              disabled={locked}
              onChange={(event) => {
                const name = event.target.value;
                setForm((current) => ({ ...current, name, slug: slugEdited ? current.slug : slugify(name) }));
              }}
            />
          </label>
          <label className="field">Slug
            <input value={form.slug} disabled={locked} onChange={(event) => { setSlugEdited(true); setForm((current) => ({ ...current, slug: event.target.value })); }} />
          </label>
          <label className="field">Tipos de Google
            <input value={form.types} disabled={locked} placeholder="barber_shop, hair_care" onChange={(event) => setForm((current) => ({ ...current, types: event.target.value }))} />
          </label>
          <label className="field">Términos
            <input value={form.terms} disabled={locked} placeholder="barbería, barber shop" onChange={(event) => setForm((current) => ({ ...current, terms: event.target.value }))} />
          </label>
          <label className="switch"><input type="checkbox" checked={form.active} disabled={locked} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> Activo</label>
          <div className="dialog-actions">
            {editing ? <button type="button" className="ghost" onClick={() => { setEditing(null); setForm(EMPTY_FORM); setSlugEdited(false); }}>Cancelar</button> : null}
            <button type="submit" className="primary" disabled={locked || save.isPending}>{save.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear giro'}</button>
          </div>
        </form>
      </div>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Eliminar giro"
        body={pendingDelete ? `Se eliminará “${pendingDelete.name}”.` : ''}
        confirmLabel="Eliminar"
        busy={remove.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => { if (pendingDelete) remove.mutate(pendingDelete.id); }}
      />
    </div>
  );
}
