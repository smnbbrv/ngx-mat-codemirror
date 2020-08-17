import { coerceBooleanProperty } from '@angular/cdk/coercion';
import { AfterViewInit, ChangeDetectionStrategy, Component, DoCheck, ElementRef, EventEmitter, HostBinding, Input, KeyValueDiffer, KeyValueDiffers, NgZone, OnDestroy, Optional, Output, Self, ViewChild, ViewEncapsulation } from '@angular/core';
import { ControlValueAccessor, NgControl } from '@angular/forms';
import { MatFormFieldControl } from '@angular/material/form-field';
import { Editor, EditorChangeLinkedList, EditorFromTextArea, ScrollInfo } from 'codemirror';
import { Subject } from 'rxjs';

@Component({
  selector: 'mat-codemirror',
  templateUrl: './mat-codemirror.component.html',
  styleUrls: ['./mat-codemirror.component.scss'],
  providers: [
    {
      provide: MatFormFieldControl,
      useExisting: MatCodemirrorComponent
    }
  ],
  preserveWhitespaces: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class MatCodemirrorComponent implements AfterViewInit, OnDestroy, ControlValueAccessor, MatFormFieldControl<string>, DoCheck {

  private static materialId = 0;

  stateChanges = new Subject<void>();

  @HostBinding() id = `mat-codemirror-component-${MatCodemirrorComponent.materialId++}`;

  @HostBinding('attr.aria-describedby') describedBy = '';

  private onChange = (_: string) => null;
  private onTouched = () => null;

  private _required = false;
  private _focused = false;
  private _disabled = false;
  private _placeholder: string;
  private _value = '';

  private _differ: KeyValueDiffer<string, any>;
  private _options: any;

  @HostBinding('class.ngx-mat-codemirror') public ngxMatCodemirror = true;

  /* class applied to the created textarea */
  @Input() className = '';
  /* name applied to the created textarea */
  @Input() name = 'codemirror';
  /* autofocus setting applied to the created textarea */
  @Input() autoFocus = false;

  /* preserve previous scroll position after updating value */
  @Input() preserveScrollPosition = false;
  /* called when the text cursor is moved */
  @Output() cursorActivity = new EventEmitter<Editor>();
  /* called when the editor is focused or loses focus */
  @Output() focusChange = new EventEmitter<boolean>();
  /* called when the editor is scrolled */
  @Output() scroll = new EventEmitter<ScrollInfo>();

  @ViewChild('ref', { static: true }) ref: ElementRef;

  codeMirror: EditorFromTextArea;

  constructor(
    @Optional() @Self() public ngControl: NgControl, // mat
    private _differs: KeyValueDiffers,
    private _ngZone: NgZone
  ) {
    if (this.ngControl != null) {
      this.ngControl.valueAccessor = this;
    }
  }

  @HostBinding('class.floating')
  get shouldLabelFloat() {
    return this.focused || !this.empty;
  }

  setDescribedByIds(ids: string[]) {
    this.describedBy = ids.join(' ');
  }

  onContainerClick(event: MouseEvent) { }

  @Input()
  get required() {
    return this._required;
  }

  set required(req) {
    this._required = coerceBooleanProperty(req);
    this.stateChanges.next();
  }

  get errorState() {
    return this.ngControl && !this.ngControl.pristine && !this.ngControl.valid;
  }

  @Input()
  get placeholder() {
    return this._placeholder;
  }

  set placeholder(plh) {
    this._placeholder = plh;
    this.stateChanges.next();
  }

  get empty() {
    return !this.value;
  }

  get value() {
    return this._value;
  }

  set value(value: string) {
    this._value = value;
    this.updateLineNumbers();
    this.stateChanges.next();
  }

  @Input()
  get disabled() {
    return this._disabled;
  }

  set disabled(dis) {
    this._disabled = coerceBooleanProperty(dis);
    this.stateChanges.next();
  }

  get focused() {
    return this._focused;
  }

  set focused(val) {
    this._focused = val;
    this.stateChanges.next();
  }

  /**
   * set options for codemirror
   * @link http://codemirror.net/doc/manual.html#config
   */
  @Input()
  set options(value: { [key: string]: any }) {
    this._options = value;
    if (!this._differ && value) {
      this._differ = this._differs.find(value).create();
    }
  }

  ngAfterViewInit() {
    if (!this.ref) {
      return;
    }
    // in order to allow for universal rendering, we import Codemirror runtime with `require` to prevent node errors
    const { fromTextArea } = require('codemirror');

    this.codeMirror = fromTextArea(this.ref.nativeElement, this._options);
    this.updateLineNumbers();
    this._ngZone.runOutsideAngular(() => {
      this.codeMirror.on('change', this.codemirrorValueChanged.bind(this));
      this.codeMirror.on('cursorActivity', this.cursorActive.bind(this));
      this.codeMirror.on('focus', this.focusChanged.bind(this, true));
      this.codeMirror.on('blur', this.focusChanged.bind(this, false));
      this.codeMirror.on('scroll', this.scrollChanged.bind(this));
    });
    this.codeMirror.setValue(this.value);
  }

  ngDoCheck() {
    if (this._differ) {
      // check options have not changed
      const changes = this._differ.diff(this._options);
      if (changes) {
        changes.forEachChangedItem(option =>
          this.setOptionIfChanged(option.key, option.currentValue),
        );
        changes.forEachAddedItem(option =>
          this.setOptionIfChanged(option.key, option.currentValue),
        );
        changes.forEachRemovedItem(option =>
          this.setOptionIfChanged(option.key, option.currentValue),
        );
      }
    }
  }

  ngOnDestroy() {
    // is there a lighter-weight way to remove the cm instance?
    if (this.codeMirror) {
      this.codeMirror.toTextArea();
    }

    this.stateChanges.complete();
  }

  codemirrorValueChanged(cm: Editor, change: EditorChangeLinkedList) {
    if (change.origin !== 'setValue') {
      this.value = cm.getValue();
      this.writeValue(cm.getValue());
    }
  }

  setOptionIfChanged(optionName: string | any, newValue: any) {
    if (!this.codeMirror) {
      return;
    }
    this.codeMirror.setOption(optionName, newValue);
  }

  focusChanged(focused: boolean) {
    this.onTouched();
    this.focused = focused;
    this.focusChange.emit(focused);
  }

  scrollChanged(cm: Editor) {
    this.scroll.emit(cm.getScrollInfo());
  }

  cursorActive(cm: Editor) {
    this.cursorActivity.emit(cm);
  }

  writeValue(value: string): void {
    if (value === null) {
      return;
    }
    if (value && !this.codeMirror) {
      this.value = value;
      return;
    }
    if (
      value &&
      value !== this.codeMirror.getValue() &&
      this.normalizeLineEndings(this.codeMirror.getValue()) !==
      this.normalizeLineEndings(value)
    ) {
      this.value = value;
      if (this.preserveScrollPosition) {
        const prevScrollPosition = this.codeMirror.getScrollInfo();
        this.codeMirror.setValue(this.value);
        this.codeMirror.scrollTo(
          prevScrollPosition.left,
          prevScrollPosition.top,
        );
        return;
      }
      this.codeMirror.setValue(this.value);
      // Don't call onChange value is from ngModel
      return;
    }
    this.onChange(this.value);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.setOptionIfChanged('readOnly', this.disabled);
  }

  private normalizeLineEndings(str: string) {
    return (str || '').replace(/\r\n|\r/g, '\n');
  }

  private updateLineNumbers() {
    if (this.codeMirror) {
      this.codeMirror.setOption('lineNumbers', !!/\n/.test(this._value));
    }
  }

}
