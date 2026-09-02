import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Settings as SettingsIcon, Image as ImageIcon, Palette } from 'lucide-react';
import { motion } from 'motion/react';
import { ImageUpload } from './ImageUpload';

export function Settings() {
  const { data, updateData, addToast } = useStore();

  const [showLoginLogo, setShowLoginLogo] = useState(data.settings?.showLoginLogo || false);
  const [loginLogoUrl, setLoginLogoUrl] = useState(data.settings?.loginLogoUrl || '');
  const [sidebarLogoUrl, setSidebarLogoUrl] = useState(data.settings?.sidebarLogoUrl || '');
  const [studentPortalLogoUrl, setStudentPortalLogoUrl] = useState(data.settings?.studentPortalLogoUrl || '');
  const [teacherPortalLogoUrl, setTeacherPortalLogoUrl] = useState(data.settings?.teacherPortalLogoUrl || '');
    const [digitalCardLogoUrl, setDigitalCardLogoUrl] = useState(data.settings?.digitalCardLogoUrl || '');
  
  // Customization
  const [loginBackgroundUrl, setLoginBackgroundUrl] = useState(data.settings?.loginBackgroundUrl || '');
  const [primaryColor, setPrimaryColor] = useState(data.settings?.primaryColor || '#F72585');
  const [bgColor, setBgColor] = useState(data.settings?.bgColor || '#0F0D15');
  const [surfaceColor, setSurfaceColor] = useState(data.settings?.surfaceColor || '#191721');
  const [textColor, setTextColor] = useState(data.settings?.textColor || '#FAF9FC');
  const [brandName, setBrandName] = useState(data.settings?.brandName || 'DanceB');
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    updateData({
      settings: {
        showLoginLogo,
        loginLogoUrl,
        sidebarLogoUrl,
        studentPortalLogoUrl,
        teacherPortalLogoUrl,
        digitalCardLogoUrl,
        loginBackgroundUrl,
        primaryColor,
        bgColor,
        surfaceColor,
        textColor,
        brandName
      }
    });
  }, [showLoginLogo, loginLogoUrl, sidebarLogoUrl, studentPortalLogoUrl, teacherPortalLogoUrl, digitalCardLogoUrl, loginBackgroundUrl, primaryColor, bgColor, surfaceColor, textColor, brandName]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const ok = await updateData({
        settings: {
          showLoginLogo,
          loginLogoUrl,
          sidebarLogoUrl,
          studentPortalLogoUrl,
          teacherPortalLogoUrl,
          digitalCardLogoUrl,
          loginBackgroundUrl,
          primaryColor,
          bgColor,
          surfaceColor,
          textColor,
          brandName
        }
      });
      // updateData ya avisa si la escritura falla.
      if (ok) addToast('Ajustes guardados correctamente', 'success');
    } catch (e) {
      addToast('Error al guardar ajustes', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto h-full overflow-y-auto">
      <header className="mb-8 flex items-center gap-3">
        <div className="p-3 bg-surface rounded-xl border border-ink-muted/10">
          <SettingsIcon className="w-6 h-6 text-magenta" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-ink">Ajustes</h1>
          <p className="text-ink-muted">Personaliza la plataforma</p>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="card">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-magenta" /> Tema y Colores
          </h2>
          <p className="text-sm text-ink-muted mb-6">Ajusta el nombre de tu marca y los colores principales que se verán en toda la aplicación.</p>
          
          <div className="space-y-4">
            <div>
              <label className="label">Nombre de la Marca</label>
              <input type="text" className="input" placeholder="Nombre de la marca" value={brandName} onChange={e => setBrandName(e.target.value)} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
               <div>
                  <label className="label text-xs">Color Primario (Acentos)</label>
                  <div className="flex gap-2">
                     <input type="color" className="w-10 h-10 rounded cursor-pointer bg-bg border-none" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} />
                     <input type="text" className="input flex-1 font-mono text-xs uppercase" placeholder="Color en hexadecimal" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} />
                  </div>
               </div>
               <div>
                  <label className="label text-xs">Color de Fondo (Background)</label>
                  <div className="flex gap-2">
                     <input type="color" className="w-10 h-10 rounded cursor-pointer bg-bg border-none" value={bgColor} onChange={e => setBgColor(e.target.value)} />
                     <input type="text" className="input flex-1 font-mono text-xs uppercase" placeholder="Color en hexadecimal" value={bgColor} onChange={e => setBgColor(e.target.value)} />
                  </div>
               </div>
               <div>
                  <label className="label text-xs">Color de Superficies (Tarjetas)</label>
                  <div className="flex gap-2">
                     <input type="color" className="w-10 h-10 rounded cursor-pointer bg-bg border-none" value={surfaceColor} onChange={e => setSurfaceColor(e.target.value)} />
                     <input type="text" className="input flex-1 font-mono text-xs uppercase" placeholder="Color en hexadecimal" value={surfaceColor} onChange={e => setSurfaceColor(e.target.value)} />
                  </div>
               </div>
               <div>
                  <label className="label text-xs">Color de Texto (Tinta)</label>
                  <div className="flex gap-2">
                     <input type="color" className="w-10 h-10 rounded cursor-pointer bg-bg border-none" value={textColor} onChange={e => setTextColor(e.target.value)} />
                     <input type="text" className="input flex-1 font-mono text-xs uppercase" placeholder="Color en hexadecimal" value={textColor} onChange={e => setTextColor(e.target.value)} />
                  </div>
               </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
            <ImageIcon className="w-5 h-5 text-magenta" /> Personalización Visual y Logos
          </h2>
          <p className="text-sm text-ink-muted mb-6">Sube las imágenes que quieres mostrar en cada parte de la plataforma. Si dejas un espacio vacío, se mostrará el texto por defecto.</p>
          
          <div className="space-y-6">
             <div className="p-4 bg-surface-hover rounded-xl border border-ink-muted/10">
                <ImageUpload 
                  value={loginBackgroundUrl} 
                  onChange={setLoginBackgroundUrl} 
                  label="Imagen de Fondo (Inicio de Sesión)"
                  placeholder="Enlace del fondo"
                />
             </div>
             
             <div className="border-t border-ink-muted/10 pt-6">
                <div className="flex items-center gap-3 mb-6 p-4 bg-surface-hover rounded-xl border border-ink-muted/10">
                  <input
                    type="checkbox"
                    id="showLoginLogo"
                    checked={showLoginLogo}
                    onChange={(e) => setShowLoginLogo(e.target.checked)}
                    className="w-5 h-5 accent-magenta"
                  />
                  <label htmlFor="showLoginLogo" className="font-medium text-ink">
                    Habilitar Logos Personalizados
                  </label>
                </div>

                {showLoginLogo && (
                  <div className="space-y-8 pl-2 md:pl-4 border-l-2 border-magenta/20">
                    <div className="p-4 bg-surface rounded-xl border border-ink-muted/5">
                      <ImageUpload 
                        value={loginLogoUrl} 
                        onChange={setLoginLogoUrl} 
                        label="Logo de Inicio de Sesión"
                        placeholder="Enlace del logo"
                      />
                    </div>
                    <div className="p-4 bg-surface rounded-xl border border-ink-muted/5">
                      <ImageUpload 
                        value={sidebarLogoUrl} 
                        onChange={setSidebarLogoUrl} 
                        label="Logo del Menú Lateral (Administrador)"
                        placeholder="Enlace del logo"
                      />
                    </div>
                    <div className="p-4 bg-surface rounded-xl border border-ink-muted/5">
                      <ImageUpload 
                        value={studentPortalLogoUrl} 
                        onChange={setStudentPortalLogoUrl} 
                        label="Logo del Portal del Alumno"
                        placeholder="Enlace del logo"
                      />
                    </div>
                    
                    <div className="p-4 bg-surface rounded-xl border border-ink-muted/5">
                      <ImageUpload
                        value={teacherPortalLogoUrl}
                        onChange={setTeacherPortalLogoUrl}
                        label="Logo del Portal del Profesor"
                        placeholder="Enlace del logo"
                      />
                    </div>

                    <div className="p-4 bg-surface rounded-xl border border-ink-muted/5">
                      <ImageUpload 
                        value={digitalCardLogoUrl} 
                        onChange={setDigitalCardLogoUrl} 
                        label="Logo del Carnet Digital"
                        placeholder="Enlace del logo"
                      />
                    </div>
                  </div>
                )}
             </div>
          </div>
        </div>

        <div className="pt-2">
          <button 
            className="btn-primary w-full md:w-auto px-8" 
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
