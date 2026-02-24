import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'docs/base',
    pathMatch: 'full'
  },
  {
    path: 'docs/base',
    loadComponent: () =>
      import('./pages/word-editor/word-editor.component')
        .then(m => m.WordEditorComponent),
    title: 'Word 文件編輯器'
  },
  {
    path: '**',
    redirectTo: 'docs/base'
  }
];
