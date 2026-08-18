import { requireUiSession } from '../api.js';
import SessionStorageManager from '../AppStorage.js';
import { setupAccountMenu } from '../accountMenu.js';
import { setupPasswordList } from './controllers/passwordListController.js';
import { setupModals } from './controllers/modalController.js';
import { setupChangePassword } from '../changePassword.js';

const session = requireUiSession();

document.addEventListener('DOMContentLoaded', async () => {
    if (!session) return; // requireUiSession ya redirigió

    setupAccountMenu(session || SessionStorageManager.getSession());
    setupChangePassword();

    const elements = {
        listEl: document.getElementById('password-list'),
        searchEl: document.getElementById('search'),
        prevBtn: document.getElementById('prev'),
        nextBtn: document.getElementById('next'),
        pageInfo: document.getElementById('page-info'),
        totalEl: document.getElementById('totalPasswords'),
    };

    const { reload } = await setupPasswordList(elements);

    setupModals({
        addBtn: document.getElementById('addPasswordBtn'),
        createModal: document.getElementById('createModal'),
        viewModal: document.getElementById('viewModal'),
        fields: {
            createName: document.getElementById('createName'),
            createPassword: document.getElementById('createPassword'),
            createDescription: document.getElementById('createDescription'),
            confirmPassword: document.getElementById('confirmPassword'),
            savePasswordBtn: document.getElementById('savePasswordBtn'),
        },
        listEl: elements.listEl,
        renderList: reload
    });
});
