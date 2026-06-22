import { ImageResponse } from 'next/og';

export const size         = { width: 32, height: 32 };
export const contentType  = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background:     '#2563EB',
          borderRadius:   8,
          width:          32,
          height:         32,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}
      >
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
    ),
    { ...size },
  );
}
