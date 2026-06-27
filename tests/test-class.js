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

    const isActive = true;

    let testClass = /* maple */ {
      host: 'fx', // maple-disable-line
      'fw-bold': true,
      'bgc-red;p-2': true,
    };

    testClass = /* maple */ 'fw-bold c-red';
    testClass = /* maple */ `
      c-blue
      p-2 m-${isActive ? '2' : '3'}
      o-50 fw-normal
      ${isActive ? 'fs-50' : 'fs-60'}
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
