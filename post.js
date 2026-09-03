/* CANOPY split file  post: awesome-pass — see openspec/changes/awesome-pass/design.md
   Post-FX pipeline. The scene renders into a linear HDR target instead of the canvas, a
   half-res bright pass feeds two gaussian lobes (half + quarter res) for bloom, a radial
   blur of the same bright pass toward the on-screen sun gives shafts, and one composite
   pass does the grade, the ACES tone map, the linear->sRGB transform and the vignette
   straight to the default framebuffer.

   Why the tone map moved here: three r152 skips the output colour-space transform when the
   destination is a render target (`outputColorSpace: renderTarget === null ? ... :
   LinearSRGBColorSpace`) but it does NOT skip tone mapping — WebGLPrograms takes
   `toneMapping` straight off the renderer regardless of the destination. So rtScene would
   come back already ACES-crushed into 0..1, with nothing above 1.0 left for the bright pass
   to find. The fix is to set `renderer.toneMapping = NoToneMapping` for as long as post-fx
   is on (restored to ACESFilmic when it is off or unavailable) so rtScene holds true linear
   radiance, and to re-implement three's ACESFilmicToneMapping (at renderer.toneMappingExposure,
   1.45) and LinearTosRGB verbatim in the composite below. With bloom and shafts at zero the
   result is the same picture as before this change. The flip happens once per toggle, not
   per frame, because toneMapping is a program-cache parameter — flipping it every frame
   would recompile every shader in the scene every frame. refreshEnvProbe saves and restores
   whatever the current value is, so it keeps working untouched.

   SHOT mode keeps post-fx ON (the screenshots should show the new look) and the composite
   is the last draw and goes to the default framebuffer, so main.js' centre-pixel
   readPixels sees the finished frame. */
'use strict';

const POST = {
  enabled: params.get('post') !== '0',
  ok: false,          // pipeline built and healthy
  hdr: false,         // half-float scene target (else UnsignedByte fallback)
  ms: 0,              // smoothed postRender() cost, ms
  toggle: null,
  passes: 0
};

(function () {
  const gl0 = renderer.getContext();
  const isGL2 = !!renderer.capabilities.isWebGL2;
  // Half-float colour is what makes a 1.05-in-linear bright threshold meaningful; on the
  // UnsignedByte fallback everything above 1.0 is already clipped, so the threshold drops.
  let hdr = false;
  try {
    hdr = isGL2 || !!(gl0.getExtension('OES_texture_half_float') && gl0.getExtension('EXT_color_buffer_half_float'));
  } catch (e) { hdr = false; }
  const TYPE = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
  POST.hdr = hdr;

  /* ---------------------------------------------------------- shared quad -- */
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  quad.frustumCulled = false;
  fsScene.add(quad);

  const VERT = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

  function mat(frag, uniforms) {
    return new THREE.ShaderMaterial({
      uniforms: uniforms, vertexShader: VERT, fragmentShader: frag,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending
    });
  }

  // `scene` targets need depth (and MSAA, since rendering off-screen loses the canvas'
  // antialias:true); the blur ping-pongs are flat colour buffers.
  function rt(w, h, isSceneRT) {
    const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: TYPE, depthBuffer: !!isSceneRT,
      stencilBuffer: false, samples: (isGL2 && isSceneRT && params.get('msaa') !== '0') ? 4 : 0
    });
    if ('colorSpace' in t.texture) t.texture.colorSpace = THREE.LinearSRGBColorSpace;
    t.texture.generateMipmaps = false;
    return t;
  }

  /* ------------------------------------------------------------- shaders -- */
  const LUM = 'float cnpLum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }\n';

  // Bright pass, full -> half. The 4-tap box is the downsample; it also keeps single-pixel
  // specular fireflies from strobing as the camera moves.
  // The knee is measured on the DISPLAY luminance (after the ACES curve at the game's
  // exposure), not on raw radiance: a lit window at night sits around 0.6 in linear — well
  // under any radiance threshold that keeps daylight walls from blooming — yet on screen it
  // is a near-white orange rectangle, and that is what should glow. Soft knee 0.45 → 0.85,
  // so windows and glow-moss bloom gently while lamps, the sun and the ring gates bloom fully.
  const ACES_GLSL =
    'vec3 cnpRRTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537;\n' +
    '  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }\n' +
    'vec3 cnpACES(vec3 color, float exposure){\n' +
    '  const mat3 IN_M = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);\n' +
    '  const mat3 OUT_M = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);\n' +
    '  color *= exposure / 0.6;\n' +
    '  color = IN_M * color; color = cnpRRTFit(color); color = OUT_M * color;\n' +
    '  return clamp(color, 0.0, 1.0);\n' +
    '}\n' +
    'vec3 cnpToSRGB(vec3 v){ return mix(pow(v, vec3(0.41666)) * 1.055 - vec3(0.055), v * 12.92,\n' +
    '  vec3(lessThanEqual(v, vec3(0.0031308)))); }\n';
  const mBright = mat(
    'uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uKnee0, uKnee1, uExposure;\n' + LUM + ACES_GLSL +
    'varying vec2 vUv;\n' +
    'void main(){\n' +
    '  vec3 c = texture2D(tSrc, vUv + vec2( uTexel.x,  uTexel.y)).rgb\n' +
    '         + texture2D(tSrc, vUv + vec2(-uTexel.x,  uTexel.y)).rgb\n' +
    '         + texture2D(tSrc, vUv + vec2( uTexel.x, -uTexel.y)).rgb\n' +
    '         + texture2D(tSrc, vUv + vec2(-uTexel.x, -uTexel.y)).rgb;\n' +
    '  c *= 0.25;\n' +
    // A NaN anywhere in the scene target would smear through the blur chain into a hard black
    // square (each 9-tap pass turns one bad texel into a block). max/min drop NaN on every GPU
    // we care about, and 64 is far above any radiance the scene produces.
    '  c = min(max(c, vec3(0.0)), vec3(64.0));\n' +
    // perceptual (sRGB-encoded) luminance of the tone-mapped pixel: what the eye calls bright
    '  vec3 tm = cnpACES(c, uExposure);\n' +
    '  float lt = cnpLum(cnpToSRGB(tm));\n' +
    '  float w = smoothstep(uKnee0, uKnee1, lt);\n' +
    '  gl_FragColor = vec4(c * w, 1.0);\n' +
    '}',
    { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uKnee0: { value: 0.45 }, uKnee1: { value: 0.85 }, uExposure: { value: renderer.toneMappingExposure } });

  // Separable 9-tap gaussian.
  const mBlur = mat(
    'uniform sampler2D tSrc; uniform vec2 uStep;\n' +
    'varying vec2 vUv;\n' +
    'void main(){\n' +
    '  vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;\n' +
    '  c += (texture2D(tSrc, vUv + uStep * 1.0).rgb + texture2D(tSrc, vUv - uStep * 1.0).rgb) * 0.1945946;\n' +
    '  c += (texture2D(tSrc, vUv + uStep * 2.0).rgb + texture2D(tSrc, vUv - uStep * 2.0).rgb) * 0.1216216;\n' +
    '  c += (texture2D(tSrc, vUv + uStep * 3.0).rgb + texture2D(tSrc, vUv - uStep * 3.0).rgb) * 0.0540540;\n' +
    '  c += (texture2D(tSrc, vUv + uStep * 4.0).rgb + texture2D(tSrc, vUv - uStep * 4.0).rgb) * 0.0162162;\n' +
    '  gl_FragColor = vec4(c, 1.0);\n' +
    '}',
    { tSrc: { value: null }, uStep: { value: new THREE.Vector2() } });

  // Radial blur of the bright pass toward the projected sun. Nothing bright between the
  // camera and the sun means nothing to smear, so occluded suns cost the same and show
  // nothing — which is the behaviour we want through leaf gaps.
  const SHAFT_N = 20;
  const mShaft = mat(
    'uniform sampler2D tSrc; uniform vec2 uSun; uniform float uFade;\n' +
    'varying vec2 vUv;\n' +
    'void main(){\n' +
    '  vec2 d = (vUv - uSun) * (0.85 / float(' + SHAFT_N + '));\n' +
    '  vec2 uv = vUv; float w = 1.0; vec3 acc = vec3(0.0); float tot = 0.0;\n' +
    '  for (int i = 0; i < ' + SHAFT_N + '; i++) {\n' +
    '    acc += texture2D(tSrc, clamp(uv, 0.0, 1.0)).rgb * w;\n' +
    '    tot += w; w *= 0.94; uv -= d;\n' +
    '  }\n' +
    '  gl_FragColor = vec4(acc / max(tot, 0.0001) * uFade, 1.0);\n' +
    '}',
    { tSrc: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uFade: { value: 0 } });

  // Composite: sum, grade, ACES (three's GLSL, ported), linear->sRGB, vignette.
  const mComp = mat(
    'uniform sampler2D tScene, tBloomA, tBloomB, tShaft;\n' +
    'uniform float uBloom, uShaft, uExposure, uGrade, uSrgb;\n' + LUM + ACES_GLSL +
    'varying vec2 vUv;\n' +
    'void main(){\n' +
    '  vec3 c = min(max(texture2D(tScene, vUv).rgb, vec3(0.0)), vec3(64.0));\n' +
    '  c += max(texture2D(tBloomA, vUv).rgb * 0.62 + texture2D(tBloomB, vUv).rgb * 0.85, vec3(0.0)) * uBloom;\n' +
    '  c += max(texture2D(tShaft, vUv).rgb, vec3(0.0)) * uShaft;\n' +
    // grade: a cool-green lift in the shadows (the light under a canopy is bounced leaf),
    // a warm bias where the picture is already hot, and a touch of saturation.
    '  if (uGrade > 0.5) {\n' +
    '    float l = cnpLum(c);\n' +
    '    c += vec3(0.010, 0.016, 0.012) * (1.0 - clamp(l, 0.0, 1.0));\n' +
    '    c *= mix(vec3(1.0), vec3(1.04, 1.0, 0.94), smoothstep(0.6, 1.6, l));\n' +
    '    c = mix(vec3(cnpLum(c)), c, 1.06);\n' +
    '  }\n' +
    '  c = cnpACES(max(c, 0.0), uExposure);\n' +
    '  if (uSrgb > 0.5) c = cnpToSRGB(c);\n' +
    '  float r = length(vUv - 0.5) * 2.0;\n' +
    '  gl_FragColor = vec4(c * (1.0 - 0.18 * smoothstep(0.55, 1.35, r)), 1.0);\n' +
    '}',
    {
      tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null }, tShaft: { value: null },
      uBloom: { value: 0.55 }, uShaft: { value: 0.35 }, uExposure: { value: renderer.toneMappingExposure },
      uGrade: { value: (params.get('pfx') || '').includes('plain') ? 0 : 1 }, uSrgb: { value: (params.get('pfx') || '').includes('nosrgb') ? 0 : 1 }
    });

  /* --------------------------------------------------------------- sizes -- */
  let rtScene = null, rtA = null, rtB = null, rtC = null, rtD = null, rtE = null;
  let W = 0, H = 0;
  const _bufSize = new THREE.Vector2();

  // The scene must render WITHOUT tone mapping while we own the frame (see the header note).
  const SCENE_TM = THREE.ACESFilmicToneMapping;
  function setToneMode(postOwnsIt) {
    const want = postOwnsIt ? THREE.NoToneMapping : SCENE_TM;
    if (renderer.toneMapping !== want) renderer.toneMapping = want;
  }

  function dispose() {
    const all = [rtScene, rtA, rtB, rtC, rtD, rtE];
    for (let i = 0; i < all.length; i++) if (all[i]) all[i].dispose();
    rtScene = rtA = rtB = rtC = rtD = rtE = null;
  }

  function build() {
    renderer.getDrawingBufferSize(_bufSize);
    const w = Math.max(2, Math.floor(_bufSize.x)), h = Math.max(2, Math.floor(_bufSize.y));
    if (w === W && h === H && rtScene) return true;
    dispose();
    try {
      rtScene = rt(w, h, true);
      const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
      const qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
      rtA = rt(hw, hh, false); rtB = rt(hw, hh, false);
      rtC = rt(qw, qh, false); rtD = rt(qw, qh, false);
      rtE = rt(qw, qh, false);
    } catch (e) {
      console.warn('CANOPY post-fx: render targets unavailable, falling back to a direct render', e);
      dispose(); POST.ok = false; POST.enabled = false; setToneMode(false); return false;
    }
    W = w; H = h;
    mBright.uniforms.uTexel.value.set(0.5 / w, 0.5 / h);
    POST.ok = true;
    setToneMode(true);
    return true;
  }

  addEventListener('resize', () => { if (POST.enabled) build(); });

  /* ---------------------------------------------------------------- draw -- */
  function draw(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(fsScene, fsCam);
  }

  const _sunNdc = new THREE.Vector3();
  let checked = false;

  /* Fog compensation. three r152's built-in shaders mix fog AFTER tone mapping and the
     sRGB encode, straight into the encoded output — so a fully fogged pixel displays the
     fog colour's LINEAR components as if they were sRGB values, i.e. much darker than the
     hex suggests. Every fog colour in updateSky / weather was tuned against that quirk.
     With the scene now rendered to a linear target, fog blends physically (before the tone
     map), and the same colours came out ~2x brighter (shot 5 centre: 81,95,72 → 155,177,138).
     So for the scene pass we swap in the linear radiance L whose tone-mapped, encoded value
     equals the old display value — per channel, through the inverse of the ACES RRT/ODT fit
     (the AP1 matrices are near-identity for these muted greens). Restored after the pass so
     nothing else ever sees the compensated colour. */
  const _fogSaved = new THREE.Color();
  function srgbToLinear(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function acesInv(y) {                                   // inverse of RRTAndODTFit, positive root
    y = Math.min(0.99, Math.max(0, y));
    const a = 1 - 0.983729 * y, b = 0.0245786 - 0.432951 * y, c = -(0.000090537 + 0.238081 * y);
    return (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
  }
  // FOG_K: 1 reproduces the old (quirk-tuned) fog exactly, 0 leaves the physically blended
  // fog alone. Full compensation turned the far end of a street canyon muddy — the old blend
  // also lit fogged geometry a little — so the default sits between; `?fogk=` overrides.
  const BLOOM_MUL = params.get('bloom') !== null ? Math.max(0, parseFloat(params.get('bloom'))) : 1;   // debug/tuning override
  const FOG_K = params.get('fogk') !== null ? Math.min(1, Math.max(0, parseFloat(params.get('fogk')))) : 0.75;
  function fogComp(v) {
    v = Math.min(1, Math.max(0, v));
    const full = acesInv(srgbToLinear(v)) * 0.6 / renderer.toneMappingExposure;
    return v + (full - v) * FOG_K;
  }

  function postRender() {
    if (!POST.enabled || (!POST.ok && !build())) {
      setToneMode(false);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }
    const t0 = performance.now();

    // 1. scene -> linear HDR target (with the fog colour pre-compensated, see fogComp)
    const fog = scene.fog;
    if (fog) { _fogSaved.copy(fog.color); fog.color.setRGB(fogComp(_fogSaved.r), fogComp(_fogSaved.g), fogComp(_fogSaved.b)); }
    renderer.setRenderTarget(rtScene);
    renderer.clear();
    renderer.render(scene, camera);
    if (fog) fog.color.copy(_fogSaved);

    // 2. bright pass (full -> half)
    mBright.uniforms.tSrc.value = rtScene.texture;
    draw(mBright, rtA);

    // 3. sun shafts (half bright -> quarter), before rtA is blurred so the rays stay crisp
    let shaft = 0;
    if (typeof sunSprite !== 'undefined' && typeof sunElev !== 'undefined' && sunElev > -0.02) {
      sunSprite.getWorldPosition(_sunNdc).project(camera);
      if (_sunNdc.z < 1 && Math.abs(_sunNdc.x) < 1.25 && Math.abs(_sunNdc.y) < 1.25) {
        // fade the rays out as the sun leaves the frame, so they never pop
        const edge = Math.max(Math.abs(_sunNdc.x), Math.abs(_sunNdc.y));
        const off = 1 - Math.max(0, (edge - 0.9) / 0.35);
        shaft = 0.35 * (typeof dayF !== 'undefined' ? dayF : 1) * off * off;
      }
    }
    if (shaft > 0.001) {
      mShaft.uniforms.tSrc.value = rtA.texture;
      mShaft.uniforms.uSun.value.set(_sunNdc.x * 0.5 + 0.5, _sunNdc.y * 0.5 + 0.5);
      mShaft.uniforms.uFade.value = 1;
      draw(mShaft, rtE);
    } else if (mShaft.uniforms.uFade.value !== 0) {
      // one cheap pass to clear the shaft buffer so a sunset doesn't leave a stale smear
      mShaft.uniforms.uFade.value = 0;
      draw(mShaft, rtE);
    }

    // 4. blur: tight lobe at half res, wide lobe at quarter res
    mBlur.uniforms.tSrc.value = rtA.texture;
    mBlur.uniforms.uStep.value.set(2 / W, 0); draw(mBlur, rtB);
    mBlur.uniforms.tSrc.value = rtB.texture;
    mBlur.uniforms.uStep.value.set(0, 2 / H); draw(mBlur, rtA);

    mBlur.uniforms.tSrc.value = rtA.texture;
    mBlur.uniforms.uStep.value.set(4 / W, 0); draw(mBlur, rtC);
    mBlur.uniforms.tSrc.value = rtC.texture;
    mBlur.uniforms.uStep.value.set(0, 4 / H); draw(mBlur, rtD);

    // 5. composite to the screen — must be the last draw (SHOT reads the default framebuffer)
    mComp.uniforms.tScene.value = rtScene.texture;
    mComp.uniforms.tBloomA.value = rtA.texture;
    mComp.uniforms.tBloomB.value = rtD.texture;
    mComp.uniforms.tShaft.value = rtE.texture;
    const dbgPlain = (params.get('pfx') || '').includes('plain');
    mComp.uniforms.uBloom.value = dbgPlain ? 0 : BLOOM_MUL * (0.35 + 0.55 * (typeof nightF !== 'undefined' ? nightF : 0));
    mComp.uniforms.uShaft.value = dbgPlain ? 0 : shaft;
    mComp.uniforms.uExposure.value = renderer.toneMappingExposure;
    draw(mComp, null);

    POST.ms += (performance.now() - t0 - POST.ms) * 0.05;
    POST.passes = 8;

    if (!checked) {
      checked = true;
      const err = renderer.getContext().getError();
      if (err !== 0) {
        console.warn('CANOPY post-fx: GL error 0x' + err.toString(16) + ' on the first composite — disabling');
        POST.enabled = false; POST.ok = false; dispose(); setToneMode(false);
      }
    }
  }

  POST.toggle = function () {
    POST.enabled = !POST.enabled;
    if (POST.enabled && !build()) return;
    if (!POST.enabled) { dispose(); W = H = 0; POST.ok = false; setToneMode(false); }
    if (typeof hint === 'function') hint('post-fx ' + (POST.enabled ? 'on' : 'off'), 1.4);
  };

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' && !e.repeat) POST.toggle();
  });

  if (POST.enabled) build();

  POST.debug = () => ({ rtScene, rtA, rtB, rtC, rtD, rtE, mBright, mBlur, mShaft, mComp, draw });   // console / harness poking only
  // published last so main.js' `typeof postRender === 'function'` only sees a working hook
  window.postRender = postRender;
})();
