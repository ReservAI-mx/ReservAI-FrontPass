import { requireAdminSession } from "../api.js";
import { setupAdminModals } from "./controllers/modalControllerAdmin.js";
import { setupAdminSearch } from "./controllers/passwordListControllerAdmin.js";
import { setupChangePassword } from "../changePassword.js";

if (!requireAdminSession()) {
  /* redirect already triggered */
}

document.addEventListener("DOMContentLoaded", () => {
  setupChangePassword();
  let selectedAccountId = null; // <-- Declaración global

  const addBtn = document.getElementById('addPasswordBtn');
  const createModal = document.getElementById('createModal');
  const viewModal = document.getElementById('viewModal');
  const passwordListEl = document.getElementById('password-list');
  const accountSearchEl = document.getElementById('account-search');
  const passwordSearchEl = document.getElementById('search');
  const selectedAccountEl = document.getElementById('selected-account');
  const createName = document.getElementById('createName');
  const createPassword = document.getElementById('createPassword');
  const createDescription = document.getElementById('createDescription');
  const confirmPassword = document.getElementById('confirmPassword');
  const savePasswordBtn = document.getElementById('savePasswordBtn');

  // Búsqueda y renderizado de cuentas y contraseñas
  setupAdminSearch({
    accountSearchEl,
    accountListEl: document.getElementById('account-list'), 
    pageInfo: document.getElementById('pageinfo'),
    passwordSearchEl,
    passwordListEl: passwordListEl,
    selectedAccountEl,
    totalEl: document.getElementById('totalPasswords'),
    prevBtn: document.getElementById('prev'),
    nextBtn: document.getElementById('next'),
    prevAccountBtn: document.getElementById('prevAccount'),
    nextAccountBtn: document.getElementById('nextAccount'),
    pageInfoAccount: document.getElementById('pageinfoAccount'),

    onAccountSelected: (accountId) => { selectedAccountId = accountId; }
  });

  // Modales de crear/ver/editar
  setupAdminModals({
    addBtn,
    createModal,
    viewModal,
    fields: {
      createName,
      createPassword,
      createDescription,
      confirmPassword,
      savePasswordBtn
    },
    listEl: passwordListEl,
    // Pasa una función para obtener el accountId actual
    getSelectedAccountId: () => selectedAccountId,
    searchInput: accountSearchEl
  });

  
});