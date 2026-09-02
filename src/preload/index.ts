import { contextBridge, ipcRenderer } from 'electron';

export const api = {
  getProjects: () => ipcRenderer.invoke('get-projects'),
  createProject: (name: string, author: string) => ipcRenderer.invoke('create-project', { name, author }),
  openProject: (projectId: string) => ipcRenderer.invoke('open-project', projectId),
  saveProject: (project: any) => ipcRenderer.invoke('save-project', project),
  deleteProject: (projectId: string) => ipcRenderer.invoke('delete-project', projectId),
};

contextBridge.exposeInMainWorld('electronAPI', api);
