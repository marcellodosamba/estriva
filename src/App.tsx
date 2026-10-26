import { useState, useEffect, useCallback } from 'react'
import { readAll, createProject, exportBackup, importBackup } from './lib/storage'
import type { Project, BackupFile } from './lib/storage'

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState<'list' | 'new-project' | 'project-detail'>('list')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

  const loadProjects = useCallback(async () => {
    try {
      const data = await readAll()
      setProjects(data.projects)
    } catch (error) {
      console.error('Erro ao carregar projetos:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleCreateProject = async (name: string, description: string, location: string, norma: 'ABNT-NBR-6118' | 'EUROCODE-2') => {
    try {
      await createProject({ name, description, location, norma })
      await loadProjects()
      setActiveView('list')
    } catch (error) {
      console.error('Erro ao criar projeto:', error)
      alert(`Erro: ${error instanceof Error ? error.message : 'Desconhecido'}`)
    }
  }

  const handleExportBackup = async () => {
    try {
      const backup = await exportBackup()
      const backupFile: BackupFile = {
        format: 'estriva-mapa-danos',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        data: backup,
      }
      const json = JSON.stringify(backupFile, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `estriva-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Erro ao exportar backup:', error)
      alert(`Erro: ${error instanceof Error ? error.message : 'Desconhecido'}`)
    }
  }

  const handleImportBackup = async (file: File) => {
    try {
      const text = await file.text()
      const backup = JSON.parse(text)
      await importBackup(backup.data)
      await loadProjects()
      alert('Backup restaurado com sucesso!')
    } catch (error) {
      console.error('Erro ao importar backup:', error)
      alert(`Erro: ${error instanceof Error ? error.message : 'Desconhecido'}`)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div>Carregando...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>ESTRIVA - Mapa de Danos</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={handleExportBackup}>Exportar Backup</button>
          <input type="file" accept=".json" onChange={(e) => e.target.files?.[0] && handleImportBackup(e.target.files[0])} style={{ display: 'none' }} id="import-file" />
          <label htmlFor="import-file" style={{ cursor: 'pointer' }}>Importar Backup</label>
        </div>
      </header>

      {activeView === 'list' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>Projetos</h2>
            <button onClick={() => setActiveView('new-project')}>Novo Projeto</button>
          </div>
          {projects.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
              Nenhum projeto cadastrado. Clique em "Novo Projeto" para começar.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {projects.map(project => (
                <li key={project.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: '0 0 0.5rem 0' }}>{project.name}</h3>
                      <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
                        {project.location ? `Local: ${project.location}` : 'Sem localização'}
                        {' | '}
                        {project.norma}
                        {' | '}
                        {new Date(project.updatedAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <button onClick={() => { setSelectedProject(project); setActiveView('project-detail'); }}>
                      Abrir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeView === 'new-project' && (
        <NewProjectForm onSubmit={handleCreateProject} onCancel={() => setActiveView('list')} />
      )}

      {activeView === 'project-detail' && selectedProject && (
        <ProjectDetail project={selectedProject} onBack={() => { setActiveView('list'); setSelectedProject(null); }} />
      )}
    </div>
  )
}

function NewProjectForm({ onSubmit, onCancel }: { onSubmit: (name: string, description: string, location: string, norma: 'ABNT-NBR-6118' | 'EUROCODE-2') => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [norma, setNorma] = useState<'ABNT-NBR-6118' | 'EUROCODE-2'>('ABNT-NBR-6118')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit(name.trim(), description.trim(), location.trim(), norma)
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '500px' }}>
      <h2>Novo Projeto</h2>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.25rem' }}>Nome do Projeto *</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }} />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.25rem' }}>Descrição</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }} />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.25rem' }}>Localização</label>
        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }} />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.25rem' }}>Norma</label>
        <select value={norma} onChange={(e) => setNorma(e.target.value as 'ABNT-NBR-6118' | 'EUROCODE-2')} style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }}>
          <option value="ABNT-NBR-6118">ABNT NBR 6118:2014</option>
          <option value="EUROCODE-2">Eurocode 2</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" style={{ flex: 1 }}>Criar Projeto</button>
        <button type="button" onClick={onCancel} style={{ flex: 1, background: '#ccc' }}>Cancelar</button>
      </div>
    </form>
  )
}

function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  return (
    <div>
      <button onClick={onBack} style={{ marginBottom: '1rem' }}>← Voltar</button>
      <h2>{project.name}</h2>
      <p>{project.description || 'Sem descrição'}</p>
      <p>Local: {project.location || 'Não informado'}</p>
      <p>Norma: {project.norma}</p>
      <div style={{ marginTop: '1rem', padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
        <h3>Funcionalidades do MVP 0.1</h3>
        <ul>
          <li>✅ F01 - Criar projeto (implementado)</li>
          <li>🔄 F02 - Registrar ocorrência (pendente UI)</li>
          <li>🔄 F03 - Anexar foto (pendente Camera API)</li>
          <li>❌ F04 - Gerar PDF (pendente @react-pdf)</li>
          <li>✅ F05 - Backup/Restore (implementado)</li>
          <li>🔄 F06 - Offline PWA (Service Worker configurado)</li>
        </ul>
      </div>
    </div>
  )
}

export default App