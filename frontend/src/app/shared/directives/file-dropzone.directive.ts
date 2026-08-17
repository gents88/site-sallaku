import { Directive, EventEmitter, HostListener, Output } from '@angular/core';

/**
 * Shared drag & drop handling for file-upload tool pages (ai-formatter,
 * ai-ppt, pdf-summary, pdf-translate, convert, ocr, pdf-editor, viewer) —
 * these used to each reimplement onDragOver/onDragLeave/onDrop locally.
 * Consumers just handle `(filesDropped)`; the host element gets a
 * `dz--active` class while a drag is over it, for the drop-zone highlight
 * styling already used across those components' SCSS.
 */
@Directive({
  selector: '[appFileDropzone]',
  standalone: true,
  exportAs: 'fileDropzone',
})
export class FileDropzoneDirective {
  @Output() filesDropped = new EventEmitter<FileList>();

  /**
   * Not bound to a host class directly — each consumer's dropzone element
   * already has its own active-state class (`.dragging`, `.dz--active`,
   * sometimes combined with a "file selected" condition), so the template
   * reads this via `#dz="fileDropzone"` and composes it with whatever
   * else that class should reflect, instead of this directive dictating
   * the class name.
   */
  isDragging = false;

  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  @HostListener('dragleave')
  onDragLeave(): void {
    this.isDragging = false;
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.filesDropped.emit(files);
    }
  }
}
