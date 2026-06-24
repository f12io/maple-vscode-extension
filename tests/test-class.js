function clsx() {}
function classNames() {}
function cva() {
  return () => {};
}

export class MyComponent {
  getClasses() {
    clsx('c-red bgc-blue', {
      'p-4': true,
      'm-2': false, // maple-disable-line
    });
  }

  getMoreClasses() {
    // maple-disable-next-line
    classNames('fw-bold', 'opacity-50', {
      fx: true,
    });

    let testClass = /* maple */ {
      host: 'fx', // maple-disable-line
      'fw-bold': true,
    };

    testClass = /* maple */ 'fw-bold c-red';
    testClass = /* maple */ `
      fw-normal
      c-blue
    `;

    return testClass;
  }

  cvaClasses = cva('base-class', {
    variants: {
      intent: {
        primary: 'bgc-blue-500 c-white',
        secondary: 'bgc-gray-500 c-black',
      },
    },
  });
}
