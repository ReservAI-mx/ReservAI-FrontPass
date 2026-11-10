import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteCategory, errorMessage, getCategories, saveCategory } from '../api';
import { ConfirmDialog, EmptyState, FallbackBanner, Loading } from '../components/ui';
import { colorFor, slugify, splitList } from '../format';
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
          <p className="eyebrow">Configuración</p>
          <h1>Giros</h1>
          <p className="lede">Un giro le dice a la búsqueda qué negocios traer de Google Maps. Los activos aparecen como opciones en el mapa.</p>
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
          <div className="giro-grid">
            {categories.map((category) => (
              <article key={category.id} className={`giro-card${category.is_active ? '' : ' off'}`}>
                <header>
                  <span className="dot big" style={{ background: colorFor(category.name) }} />
                  <strong>{category.name}</strong>
                  <label className="toggle mini" title={category.is_active ? 'Activo: sale en el mapa' : 'Inactivo: no sale en el mapa'}>
                    <input type="checkbox" checked={category.is_active} disabled={locked || toggle.isPending} onChange={() => toggle.mutate(category)} />
                    <span>{category.is_active ? 'Activo' : 'Inactivo'}</span>
                  </label>
                </header>
                <div>
                  <p className="section-label">Lo busca como</p>
                  <div className="chips small-chips">
                    {category.search_terms.length ? category.search_terms.map((term) => <span key={term} className="chip static">{term}</span>) : <span className="muted">—</span>}
                  </div>
                </div>
                <div>
                  <p className="section-label">Tipo en Google</p>
                  <p className="code-list">{category.google_place_types.join(', ') || '—'}</p>
                </div>
                <footer>
                  <button type="button" className="ghost sm" disabled={locked} onClick={() => beginEdit(category)}>Editar</button>
                  <button type="button" className="danger sm" disabled={locked} onClick={() => setPendingDelete(category)}>Eliminar</button>
                </footer>
              </article>
            ))}
          </div>
        </div>
        <form className="panel" onSubmit={onSubmit}>
          <h2>{editing ? `Editar “${editing.name}”` : 'Nuevo giro'}</h2>
          <label className="field">Nombre
            <input
              value={form.name}
              disabled={locked}
              placeholder="Barberías"
              onChange={(event) => {
                const name = event.target.value;
                setForm((current) => ({ ...current, name, slug: slugEdited ? current.slug : slugify(name) }));
              }}
            />
            <span className="hint">Como lo verán los vendedores en el mapa.</span>
          </label>
          <label className="field">Palabras de búsqueda
            <input value={form.terms} disabled={locked} placeholder="barbería, barber shop" onChange={(event) => setForm((current) => ({ ...current, terms: event.target.value }))} />
            <span className="hint">Lo que escribirías en Google Maps. Separa con comas.</span>
          </label>
          <label className="field">Tipos de Google (opcional)
            <input value={form.types} disabled={locked} placeholder="barber_shop, hair_care" onChange={(event) => setForm((current) => ({ ...current, types: event.target.value }))} />
            <span className="hint">Categorías oficiales de Google Places; afinan la búsqueda.</span>
          </label>
          <details className="more">
            <summary>Avanzado</summary>
            <label className="field">Identificador (slug)
              <input value={form.slug} disabled={locked} onChange={(event) => { setSlugEdited(true); setForm((current) => ({ ...current, slug: event.target.value })); }} />
            </label>
          </details>
          <label className="toggle"><input type="checkbox" checked={form.active} disabled={locked} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /><span>Activo (sale en el mapa)</span></label>
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
