import { ImageResponse } from 'next/og';

export const size         = { width: 32, height: 32 };
export const contentType  = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background:     '#2563EB',   // blue-600 — matches the site's primary colour
          borderRadius:   8,
          width:          32,
          height:         32,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}
      >
        {/* Shield outline */}
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            width:          20,
            height:         22,
            position:       'relative',
          }}
        >
          {/* "A" — AdLeak, bold white, reads clearly at all favicon sizes */}
          <span
            style={{
              color:       'white',
              fontSize:    20,
              fontWeight:  900,
              fontFamily:  'sans-serif',
              lineHeight:  1,
              marginTop:   1,
            }}
          >
            A
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
