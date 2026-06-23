function clsx() {}
function cva() {}

const buttonVariants = cva('btn bgc-blue-500', {
  variants: {
    intent: {
      primary: 'c-white fw-bold',
      secondary: 'c-gray-500 bgc-gray-100',
    },
  },
});

export function MyComponent() {
  const isActive = true;
  return (
    <div className="bgc-blue-500 c-white p-4">
      <span className={`fw-bold ${true ? 'm-4' : 'm-6'}`}>React Example</span>
      <span
        className={clsx({
          'fw-bold': true,
          'm-4': true,
          'm-6': false,
        })}
      ></span>
      <span className={clsx('fw-bold m-4', 'm-6')}></span>
      <span className={clsx(['fw-bold m-4', 'm-6'])}></span>
      <span className={clsx([true && 'fw-bold', true ? 'm-6' : 'm-4'])}></span>

      {/* Edge cases */}
      <span className={buttonVariants({ intent: 'primary' })}></span>
      <span className={clsx('p-2', clsx('m-2', isActive && 'fw-bold'))}></span>
      <span
        className={`
          fxcol-ss invalid-maple-class
          ${isActive ? 'bgc-green-500' : 'bgc-red-500'}
        `}
      ></span>
    </div>
  );
}
