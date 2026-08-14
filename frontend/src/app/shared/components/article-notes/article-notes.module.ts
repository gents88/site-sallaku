import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { ArticleNotesComponent } from './article-notes.component';

@NgModule({
  declarations: [ArticleNotesComponent],
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule],
  exports: [ArticleNotesComponent],
})
export class ArticleNotesModule {}
