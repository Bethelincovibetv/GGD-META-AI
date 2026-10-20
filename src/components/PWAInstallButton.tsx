import React, { useState } from 'react';
import { Download, Share2, PlusSquare, X, CheckCircle2, Sparkles, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'sidebar' | 'header' | 'banner';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'sidebar',
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If already running in standalone PWA mode
  if (isInstalled) {
    if (variant === 'sidebar') {
      return (
        <div className={`px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center space-x-2.5 ${className}`}>
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-emerald-300 truncate">PWA Installed</p>
            <p className="text-[10px] text-emerald-400/80 truncate">Running in standalone app</p>
          </div>
        </div>
      );
    }
    return null;
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (isInstallable) {
      setInstalling(true);
      try {
        await install();
      } finally {
        setInstalling(false);
      }
    } else {
      // If browser hasn't fired beforeinstallprompt yet or user is on desktop browser without prompt
      setShowIOSModal(true);
    }
  };

  return (
    <>
      {variant === 'sidebar' && (
        <div className={`p-3 rounded-xl bg-gradient-to-br from-emerald-950/60 via-slate-900 to-teal-950/40 border border-emerald-500/30 shadow-lg shadow-emerald-950/30 ${className}`}>
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 text-emerald-400 mt-0.5">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-bold text-white tracking-wide">Install Hub App</span>
                <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">PWA</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight mt-1">
                Install as a native app on your phone or desktop for instant access.
              </p>
            </div>
          </div>
          <button
            onClick={handleInstallClick}
            disabled={installing}
            className="mt-2.5 w-full flex items-center justify-center space-x-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-md shadow-emerald-900/40 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{installing ? 'Installing...' : isIOS ? 'Install on iOS' : 'Install App'}</span>
          </button>
        </div>
      )}

      {variant === 'header' && (
        <button
          onClick={handleInstallClick}
          disabled={installing}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-medium shadow-md shadow-emerald-900/30 transition-all cursor-pointer active:scale-95 ${className}`}
          title="Install as Progressive Web App"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{isIOS ? 'Install PWA' : 'Install App'}</span>
        </button>
      )}

      {/* iOS & Manual Installation Modal Guide */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 p-6 shadow-2xl text-slate-100 relative">
            <button
              onClick={() => setShowIOSModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Download className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Install Baileys Hub</h3>
                <p className="text-xs text-slate-400">Add to your device home screen or desktop</p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs text-slate-300 my-4">
              {isIOS ? (
                <>
                  <div className="flex items-start space-x-3 p-3 rounded-xl bg-slate-800/70 border border-slate-700/60">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Share2 className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">Step 1: Tap the Share button</p>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        In Safari's bottom toolbar, tap the square icon with an upward arrow.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-3 rounded-xl bg-slate-800/70 border border-slate-700/60">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <PlusSquare className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">Step 2: Tap "Add to Home Screen"</p>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        Scroll down the menu list and select <strong>Add to Home Screen</strong>, then tap <strong>Add</strong> in the top-right corner.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3.5 rounded-xl bg-slate-800/70 border border-slate-700/60 space-y-2">
                    <p className="font-semibold text-white">Chrome / Edge / Chromium Browsers</p>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      1. Look for the install icon <strong className="text-emerald-400">(+)</strong> in your browser's address bar, or open the browser menu (⋮).<br />
                      2. Click <strong>Install Baileys WhatsApp Hub</strong>.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-800/70 border border-slate-700/60 space-y-2">
                    <p className="font-semibold text-white">Mobile Devices</p>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Open your browser's options menu (top right on Android) and select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowIOSModal(false)}
                className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
