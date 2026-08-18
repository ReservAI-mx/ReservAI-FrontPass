import { createPassword as createPasswordService, fetchPasswordById, updatePasswordAttribute } from '../services/passwordService.js';
import { showError, showMessage } from '../service/uiHelpers.js';
import SessionStorageManager from '../../AppStorage.js';

export function setupModals({ addBtn, createModal, viewModal, fields, listEl, passwords, renderList }) {
    const { createName, createPassword: createPasswordInput, createDescription, confirmPassword, savePasswordBtn } = fields;

    // --- Lógica de cierre de modales ---
    // Cerrar modal al hacer clic en el botón X
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            const modalId = this.getAttribute('data-close');
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.remove('show');
            }
        });
    });

    // Cerrar modal al hacer clic en el botón "Cerrar"
    document.querySelectorAll('.close-btn').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            const modalId = this.getAttribute('data-close');
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.remove('show');
            }
        });
    });

    // Cerrar modal de crear contraseña con botón X específico
    document.querySelectorAll('.closecreate').forEach(btn =>
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modalcreate');
            if (modal) {
                modal.classList.remove('show');
                // Limpiar el formulario al cerrar
                clearCreatePasswordForm();
            }
        })
    );

    // Cerrar modal al hacer clic fuera del contenido
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('show');
            }
        });
    });

    document.querySelectorAll('.modalcreate').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('show');
                clearCreatePasswordForm();
            }
        });
    });

    // --- Configurar logout ---
    const logoutBtn = document.getElementById("logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", function(e) {
            e.preventDefault();
            SessionStorageManager.clearSession();
            window.location.href = "/login";
        });
    }

    // --- Modal Crear ---
    addBtn?.addEventListener('click', () => {
        const overlay = document.getElementById("createLoadingOverlay");
        if (overlay) overlay.style.display = "flex";
        createModal.classList.add('show');
        setTimeout(() => {
            if (overlay) overlay.style.display = "none";
            createName.value = '';
            createPasswordInput.value = '';
            createDescription.value = '';
            confirmPassword.value = '';
        }, 800); 
    });



    const toggleCreatePasswordBtn = document.getElementById('toggleCreatePassword');
    const eyeIconCreate = toggleCreatePasswordBtn?.querySelector('i');
    if (toggleCreatePasswordBtn && createPasswordInput && eyeIconCreate) {
        toggleCreatePasswordBtn.addEventListener('click', () => {
            const isHidden = createPasswordInput.type === 'password';
            createPasswordInput.type = isHidden ? 'text' : 'password';
            eyeIconCreate.className = isHidden ? 'fas fa-eye-slash' : 'fas fa-eye';
            toggleCreatePasswordBtn.title = isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña';
        });
    }

    const toggleConfirmPasswordBtn = document.getElementById('toggleConfirmPassword');
    const eyeIconConfirm = toggleConfirmPasswordBtn?.querySelector('i');
    if (toggleConfirmPasswordBtn && confirmPassword && eyeIconConfirm) {
        toggleConfirmPasswordBtn.addEventListener('click', () => {
            const isHidden = confirmPassword.type === 'password';
            confirmPassword.type = isHidden ? 'text' : 'password';
            eyeIconConfirm.className = isHidden ? 'fas fa-eye-slash' : 'fas fa-eye';
            toggleConfirmPasswordBtn.title = isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña';
        });
    }

    savePasswordBtn?.addEventListener('click', async () => {
        const name = createName.value.trim();
        const pass = createPasswordInput.value;
        const confirm = confirmPassword.value;
        const desc = createDescription.value.trim();
    
        let valid = true;

        if (!name) {
            showError(createName, "El nombre es necesario");
            valid = false;
        }
        if (!pass) {
            showError(createPasswordInput, "La contraseña es necesaria");
            valid = false;
        }
        if (!confirm) {
            showError(confirmPassword, "Confirma tu contraseña");
            valid = false;
        }
        if (pass && confirm && pass !== confirm) {
            showError(confirmPassword, "Las contraseñas no coinciden");
            showError(createPasswordInput, "Las contraseñas no coinciden");
            valid = false;
        }
        if (!valid) return;

        try {
            await createPasswordService({ name, password: pass, description: desc });
            showMessage("Contraseña guardada correctamente");
            setTimeout(() => {
                createModal.classList.remove('show');
            }, 1500);
            renderList();
        } catch (err) {
            showMessage("Error al guardar la contraseña: " + err.message);
        }
    });

    // --- Modal Ver Contraseña ---
    listEl?.addEventListener('click', async (e) => {
        const item = e.target.closest('.password-item');
        if (!item) return;

        const passwordId = item.dataset.id;
        const modalBody = viewModal.querySelector('#modalBody');
        modalBody.innerHTML = '<div style="text-align:center;">⏳ Cargando contraseña...</div>';
        viewModal.classList.add('show');

        try {
            const fullPass = await fetchPasswordById(passwordId);

            modalBody.innerHTML = fullPass.toHTML();

            // Un span con role="button" no dispara click con el teclado.
            modalBody.querySelectorAll('.edit-icon').forEach((icono) => {
                icono.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        icono.click();
                    }
                });
            });

            // Si NO es editable, quita los iconos de edición y no asigna listeners
            if (!fullPass.updateableByClient) {
                modalBody.querySelectorAll('.edit-icon').forEach(icon => icon.remove());
            } else {
                const aviso = document.createElement('p');
                aviso.className = 'edit-hint';
                aviso.textContent = 'Toca el lápiz de cada campo para editarlo.';
                modalBody.appendChild(aviso);

                // Editar nombre
                const nameDiv = modalBody.querySelector('.password-name');
                const nameSpan = nameDiv?.querySelector('.editable-name');
                const nameEditIcon = nameDiv?.querySelector('.edit-icon[title="Editar nombre"]');
                if (nameDiv && nameSpan && nameEditIcon) {
                    nameEditIcon.addEventListener('click', async () => {
                        const currentValue = nameSpan.textContent.trim();
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.value = currentValue;
                        input.className = 'edit-input';
                        let replaced = false;
                        nameDiv.replaceChild(input, nameSpan);
                        input.focus();

                        input.addEventListener('blur', async () => {
                            if (replaced) return;
                            const newValue = input.value.trim();
                            if (newValue && newValue !== currentValue) {
                                try {
                                    await updatePasswordAttribute(fullPass.id, "name", newValue);
                                    showMessage("Nombre actualizado");
                                    fullPass.name = newValue;
                                    document.dispatchEvent(new CustomEvent('passwordUpdated'));
                                    const newSpan = document.createElement('span');
                                    newSpan.className = 'editable-name';
                                    newSpan.textContent = newValue;
                                    if (input.parentNode === nameDiv && !replaced) {
                                        replaced = true;
                                        nameDiv.replaceChild(newSpan, input);
                                        return;
                                    }
                                } catch (err) {
                                    showMessage("Error al actualizar nombre");
                                    if (input.parentNode === nameDiv && !replaced) {
                                        replaced = true;
                                        nameDiv.replaceChild(nameSpan, input);
                                        return;
                                    }
                                }
                            } else {
                                if (input.parentNode === nameDiv && !replaced) {
                                    replaced = true;
                                    nameDiv.replaceChild(nameSpan, input);
                                    return;
                                }
                            }
                        });

                        input.addEventListener('keydown', (ev) => {
                            if (ev.key === 'Enter') input.blur();
                            if (ev.key === 'Escape' && input.parentNode === nameDiv && !replaced) {
                                replaced = true;
                                nameDiv.replaceChild(nameSpan, input);
                                return;
                            }
                        });
                    });
                }

                // Editar descripción
                const descDiv = modalBody.querySelector('.password-description');
                const descSpan = descDiv?.querySelector('.editable-description');
                const descEditIcon = descDiv?.querySelector('.edit-icon[title="Editar descripción"]');
                if (descDiv && descSpan && descEditIcon) {
                    descEditIcon.addEventListener('click', async () => {
                        const currentValue = descSpan.textContent.trim();
                        const textarea = document.createElement('textarea');
                        textarea.value = currentValue;
                        textarea.className = 'edit-input';
                        let replaced = false;
                        descDiv.replaceChild(textarea, descSpan);
                        textarea.focus();

                        textarea.addEventListener('blur', async () => {
                            if (replaced) return;
                            const newValue = textarea.value.trim();
                            if (newValue !== currentValue) {
                                try {
                                    await updatePasswordAttribute(fullPass.id, "description", newValue);
                                    showMessage("Descripción actualizada");
                                    fullPass.description = newValue;
                                    document.dispatchEvent(new CustomEvent('passwordUpdated'));
                                    const newSpan = document.createElement('span');
                                    newSpan.className = 'editable-description';
                                    newSpan.textContent = newValue;
                                    if (textarea.parentNode === descDiv && !replaced) {
                                        replaced = true;
                                        descDiv.replaceChild(newSpan, textarea);
                                        return;
                                    }
                                } catch (err) {
                                    showMessage("Error al actualizar descripción");
                                    if (textarea.parentNode === descDiv && !replaced) {
                                        replaced = true;
                                        descDiv.replaceChild(descSpan, textarea);
                                        return;
                                    }
                                }
                            } else {
                                if (textarea.parentNode === descDiv && !replaced) {
                                    replaced = true;
                                    descDiv.replaceChild(descSpan, textarea);
                                    return;
                                }
                            }
                        });

                        textarea.addEventListener('keydown', (ev) => {
                            if (ev.key === 'Enter') textarea.blur();
                            if (ev.key === 'Escape' && textarea.parentNode === descDiv && !replaced) {
                                replaced = true;
                                descDiv.replaceChild(descSpan, textarea);
                                return;
                            }
                        });
                    });
                }

                // Editar contraseña
                const passDiv = modalBody.querySelector('.password-value-container');
                const passSpan = passDiv?.querySelector('.password-text');
                const passEditIcon = passDiv?.querySelector('.edit-icon[title="Editar contraseña"]');
                if (passDiv && passSpan && passEditIcon) {
                    passEditIcon.addEventListener('click', async () => {
                        const currentValue = passSpan.dataset.password || '';
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.value = currentValue;
                        input.className = 'edit-input';
                        let replaced = false;
                        const passDisplay = passDiv.querySelector('.password-display');
                        passDisplay.replaceChild(input, passSpan);
                        input.focus();

                        input.addEventListener('blur', async () => {
                            if (replaced) return;
                            const newValue = input.value.trim();
                            if (newValue && newValue !== currentValue) {
                                try {
                                    await updatePasswordAttribute(fullPass.id, "password", newValue);
                                    showMessage("Contraseña actualizada");
                                    fullPass.password = newValue;
                                    document.dispatchEvent(new CustomEvent('passwordUpdated'));
                                    const newPassSpan = document.createElement('div');
                                    newPassSpan.className = 'password-text';
                                    newPassSpan.dataset.password = newValue;
                                    newPassSpan.textContent = '*************';
                                    if (input.parentNode === passDisplay && !replaced) {
                                        replaced = true;
                                        passDisplay.replaceChild(newPassSpan, input);
                                        return;
                                    }
                                    // --- REASIGNA LOS LISTENERS ---
                                    const toggleBtn = modalBody.querySelector('.toggle-password-btn');
                                    const eyeIcon = modalBody.querySelector('.eye-icon');
                                    if (toggleBtn && newPassSpan && eyeIcon) {
                                        toggleBtn.addEventListener('click', () => {
                                            const isVisible = newPassSpan.textContent !== '*************';
                                            if (isVisible) {
                                                newPassSpan.textContent = '*************';
                                                eyeIcon.className = 'fas fa-eye eye-icon';
                                                toggleBtn.classList.remove('active');
                                                toggleBtn.title = 'Mostrar contraseña';
                                            } else {
                                                newPassSpan.textContent = newPassSpan.dataset.password;
                                                eyeIcon.className = 'fas fa-eye-slash eye-icon';
                                                toggleBtn.classList.add('active');
                                                toggleBtn.title = 'Ocultar contraseña';
                                            }
                                        });
                                    }
                                    const copyBtn = modalBody.querySelector('.copy-password-btn');
                                    const copyIcon = modalBody.querySelector('.copy-icon');
                                    if (copyBtn && newPassSpan && copyIcon) {
                                        copyBtn.addEventListener('click', async () => {
                                            try {
                                                await navigator.clipboard.writeText(newPassSpan.dataset.password);
                                                copyIcon.className = 'fas fa-check copy-icon';
                                                copyBtn.classList.add('copied');
                                                copyBtn.title = '¡Copiado!';
                                                setTimeout(() => {
                                                    copyIcon.className = 'fas fa-copy copy-icon';
                                                    copyBtn.classList.remove('copied');
                                                    copyBtn.title = 'Copiar contraseña';
                                                }, 2000);
                                            } catch {
                                                showMessage('No se pudo copiar la contraseña');
                                            }
                                        });
                                    }
                                    // --- FIN REASIGNACIÓN ---
                                } catch (err) {
                                    showMessage("Error al actualizar contraseña");
                                    if (input.parentNode === passDisplay && !replaced) {
                                        replaced = true;
                                        passDisplay.replaceChild(passSpan, input);
                                        return;
                                    }
                                }
                            } else {
                                if (input.parentNode === passDisplay && !replaced) {
                                    replaced = true;
                                    passDisplay.replaceChild(passSpan, input);
                                    return;
                                }
                            }
                        });

                        input.addEventListener('keydown', (ev) => {
                            if (ev.key === 'Enter') input.blur();
                            if (ev.key === 'Escape' && input.parentNode === passDisplay && !replaced) {
                                replaced = true;
                                passDisplay.replaceChild(passSpan, input);
                                return;
                            }
                        });
                    });
                }
            }

            // --- Botón Mostrar/Ocultar ---
            const toggleBtn = modalBody.querySelector('.toggle-password-btn');
            const passwordText = modalBody.querySelector('.password-text');
            const eyeIcon = modalBody.querySelector('.eye-icon');

            if (toggleBtn && passwordText && eyeIcon) {
                toggleBtn.addEventListener('click', () => {
                    const isVisible = passwordText.textContent !== '*************';
                    if (isVisible) {
                        passwordText.textContent = '*************';
                        eyeIcon.className = 'fas fa-eye eye-icon';
                        toggleBtn.classList.remove('active');
                        toggleBtn.title = 'Mostrar contraseña';
                    } else {
                        passwordText.textContent = passwordText.dataset.password;
                        eyeIcon.className = 'fas fa-eye-slash eye-icon';
                        toggleBtn.classList.add('active');
                        toggleBtn.title = 'Ocultar contraseña';
                    }
                });
            }

            // --- Botón Copiar ---
            const copyBtn = modalBody.querySelector('.copy-password-btn');
            const copyIcon = modalBody.querySelector('.copy-icon');
            if (copyBtn && passwordText && copyIcon) {
                copyBtn.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(passwordText.dataset.password);
                        copyIcon.className = 'fas fa-check copy-icon';
                        copyBtn.classList.add('copied');
                        copyBtn.title = '¡Copiado!';
                        setTimeout(() => {
                            copyIcon.className = 'fas fa-copy copy-icon';
                            copyBtn.classList.remove('copied');
                            copyBtn.title = 'Copiar contraseña';
                        }, 2000);
                    } catch {
                        showMessage('No se pudo copiar la contraseña');
                    }
                });
            }

        } catch (err) {
            console.error("Error al cargar la contraseña:", err);
            modalBody.innerHTML = '<div style="text-align:center;color:red;">❌ Error al cargar la contraseña</div>';
            showMessage("Error al obtener la contraseña");
        }
    });
}

// Función para limpiar el formulario de crear contraseña
function clearCreatePasswordForm() {
    const createName = document.getElementById('createName');
    const createPassword = document.getElementById('createPassword');
    const confirmPassword = document.getElementById('confirmPassword');
    const createDescription = document.getElementById('createDescription');

    if (createName) createName.value = '';
    if (createPassword) createPassword.value = '';
    if (confirmPassword) confirmPassword.value = '';
    if (createDescription) createDescription.value = '';
}