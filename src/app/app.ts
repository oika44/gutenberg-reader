import { Component } from '@angular/core';
import { ReaderComponent } from './components/reader/reader.component';

@Component({
  selector: 'app-root',
  imports: [ReaderComponent],
  template: '<app-reader />',
})
export class App {}
