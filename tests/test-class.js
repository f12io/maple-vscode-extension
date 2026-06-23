function clsx() {}
function classNames() {}
function cva() {
  return () => {};
}

export class MyComponent {
  getClasses() {
    clsx('c-red bgc-blue', {
      'p-4': true,
      'm-2': false,
    });
  }

  getMoreClasses() {
    classNames('fw-bold', 'opacity-50', {
      fx: true,
    });

    const testClass = {
      host: 'fx',
      'fw-bold': true,
    };

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
