function Component(arg0: {
  selector: string;
  template: string;
  host: any;
}): (
  target: typeof TestComponent,
  context: ClassDecoratorContext<typeof TestComponent>,
) => typeof TestComponent {
  throw new Error('Function not implemented.');
}

@Component({
  selector: 'app-test',
  template: `
    <div class="c-red bgc-blue p-4">
      <span [class.fw-bold]="isBold"></span>
      <div [ngClass]="{ 'o-50': isDim }"></div>
    </div>
  `,
  host: {
    class: 'd-flex m-2',
    '[class.fxcol-ss]': 'isActive',
  },
})
export class TestComponent {
  isBold = true;
  isDim = false;
  isActive = true;
}
