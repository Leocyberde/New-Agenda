import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Variável global para armazenar o evento de instalação PWA
let deferredPrompt: any;

// Registrar Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// Evento para capturar quando o PWA pode ser instalado
window.addEventListener('beforeinstallprompt', (e) => {
  console.log('PWA: beforeinstallprompt event triggered');
  
  // Previne o mini-infobar automático do Chrome em mobile
  e.preventDefault();
  
  // Armazena o evento para usar mais tarde
  deferredPrompt = e;
  
  // Verifica se já existe um botão de instalação e o mostra
  const installButton = document.getElementById('pwa-install-button');
  if (installButton) {
    installButton.style.display = 'block';
  } else {
    // Cria um botão de instalação flutuante se não existir
    createInstallButton();
  }
});

// Função para criar botão de instalação
function createInstallButton() {
  const installButton = document.createElement('button');
  installButton.id = 'pwa-install-button';
  installButton.innerHTML = '📱 Instalar App';
  installButton.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #8b5cf6;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1000;
    transition: all 0.2s ease;
  `;
  
  installButton.addEventListener('mouseover', () => {
    installButton.style.background = '#7c3aed';
    installButton.style.transform = 'translateY(-2px)';
  });
  
  installButton.addEventListener('mouseout', () => {
    installButton.style.background = '#8b5cf6';
    installButton.style.transform = 'translateY(0)';
  });
  
  installButton.addEventListener('click', async () => {
    if (!deferredPrompt) {
      console.log('PWA: No deferred prompt available');
      return;
    }
    
    // Mostra o prompt de instalação
    deferredPrompt.prompt();
    
    // Aguarda a escolha do usuário
    const { outcome } = await deferredPrompt.userChoice;
    console.log('PWA: User choice:', outcome);
    
    if (outcome === 'accepted') {
      console.log('PWA: User accepted the install prompt');
    } else {
      console.log('PWA: User dismissed the install prompt');
    }
    
    // Limpa o prompt deferido
    deferredPrompt = null;
    
    // Remove o botão
    installButton.remove();
  });
  
  document.body.appendChild(installButton);
}

// Evento para quando o PWA é instalado
window.addEventListener('appinstalled', () => {
  console.log('PWA: App was installed successfully');
  
  // Remove o botão de instalação se ainda estiver visível
  const installButton = document.getElementById('pwa-install-button');
  if (installButton) {
    installButton.remove();
  }
  
  // Limpa o prompt deferido
  deferredPrompt = null;
});

createRoot(document.getElementById("root")!).render(<App />);