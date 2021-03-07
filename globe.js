(function () {
  const container = document.getElementById("globe");
  const canvas = container.getElementsByTagName("canvas")[0];

  const imageurl = "https://i.imgur.com/uw4LXkJ.png";

  const GLOBE_RADIUS = 600; //the radius of the earth
  const GLOBE_WIDTH = 3467; //the width of the image
  const GLOBE_HEIGHT = 1890; //the height of the image
  const DOT_COUNT = 30000; //the number of dots on the earth
  const MAX_ARCS = 5; //the max number of arcs
  const ARC_DURATION = 4000; //how long the arcs take (in miliseconds)
  const ARC_PROBABILITY = 0.1; //the probabilty, on each frame render, for an arc to appear
  const DOT_SHADER_OFFSET = 1000;
  const ARC_SHADER_OFFSET = 1000;
  const ARC_VERTICES = 3000;

  let arcs = []; //an array of all the arc objects
  let dots = []; //an array of all the dot objects

  /**
   * Loads the map data
   */
  async function loadMapData() {
    let img = new Image();
    img.src = imageurl;

    return new Promise((resolve) => {
      img.onload = function () {
        img.crossOrigin = "Anonymous";
        //draw background image
        var canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext("2d").drawImage(img, 0, 0, img.width, img.height);
        var pixelData = canvas
          .getContext("2d")
          .getImageData(0, 0, img.width, img.height);
        resolve(pixelData);
      };
    });
  }

  /**
   * Converts a position in x,y,z to u,v
   * @param {Vector3} point the vector to convert to U and V
   * @returns {u,v}
   */
  function pointToUV(point) {
    let normal = point.normalize();
    let u = 0.5 + Math.atan2(normal.x, normal.z) / (2 * Math.PI);
    let v = 0.5 - Math.asin(normal.y) / Math.PI;

    let returnObj = {
      u: u,
      v: v,
    };
    return returnObj;
  }

  /**
   * Gets the indices in the Uint8ClampedArray of ImageData
   * @param {Number} x
   * @param {Number} y
   * @returns {Array<Number>} [red_indices, blue_indices, green_indices, alpha_indices]
   */
  function getPixelInd(x, y) {
    var red = y * (GLOBE_WIDTH * 4) + x * 4;
    return [red, red + 1, red + 2, red + 3];
  }

  /**
   * Gets the colors from an array of 4 indices
   * @param {Array<Number>} ind [red_indices, blue_indices, green_indices, alpha_indices]
   * @param {ImageData} data
   * @returns {Array<Number>} [red, blue, green, alpha]
   */
  function getColorsFromInd(ind, data) {
    let arr = data.data;
    let colors = [];
    colors.push(arr[ind[0]]);
    colors.push(arr[ind[1]]);
    colors.push(arr[ind[2]]);
    colors.push(arr[ind[3]]);
    return colors;
  }

  /**
   * Gets the colors from a uv value
   * @param {Object} uv {u: u_Value, v: v_Value}
   * @param {ImageData} data
   * @returns {Array<Number>} [red, blue, green, alpha]
   */
  function sampleImage(uv, data) {
    let x = Math.floor(GLOBE_WIDTH * uv.u);
    let y = Math.floor(GLOBE_HEIGHT * uv.v);
    let ind = getPixelInd(x, y);
    let colors = getColorsFromInd(ind, data);
    return colors;
  }

  /**
   * Gets the colors from a uv value
   * @param {Array<Number>} colors [red, blue, green, alpha]
   * @returns {Boolean} if the pixel is black
   */
  function pixelIsBlank(colors) {
    let r = colors[0];
    let g = colors[1];
    let b = colors[2];
    let a = colors[3];

    if (r === 0 && g === 0 && b === 0) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Places the dots on the earth
   * @param {Uint8ClampedArray} mapData
   * @param {THREE.Scene} scene
   */

  function placeDots(mapData, scene) {
    for (let i = DOT_COUNT; i >= 0; i--) {
      const phi = Math.acos(-1 + (2 * i) / DOT_COUNT);
      const theta = Math.sqrt(DOT_COUNT * Math.PI) * phi;

      let newDot = new Dot(phi, theta);

      const uv = pointToUV(newDot.boundingSphere);
      const colors = sampleImage(uv, mapData);

      //draws the circle based on the map
      if (!pixelIsBlank(colors)) {
        newDot.addToScene(scene);
      }
    }
    console.log("Dots placed:", dots.length);
  }

  /**
   * Builds the globe
   * @param {THREE.Scene} scene
   */
  function buildGlobe(scene) {
    const geometry = new THREE.SphereGeometry(GLOBE_RADIUS, 32, 32);
    const material = new THREE.MeshBasicMaterial({
      color: "#5BADF0",
      transparent: true,
      opacity: 0.8,
    });
    const sphereLayer1 = new THREE.Mesh(geometry, material);
    scene.add(sphereLayer1);

    /*
    const outerSphere = new THREE.SphereGeometry(GLOBE_RADIUS, 32, 32);
    const material2 = new THREE.MeshBasicMaterial({
      color: "#6abcff",
      transparent: true,
      opacity: 0.5,
    });
    const sphereLayer2 = new THREE.Mesh(outerSphere, material2);
    scene.add(sphereLayer2);
    */
  }

  /**
   * Finds out if the browser has webgl
   * @returns {Boolean}
   */
  function hasWebGL() {
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl && gl instanceof WebGLRenderingContext) {
      return true;
    } else {
      return false;
    }
  }

  if (hasWebGL()) {
    init();
  }

  function updateArcs(scene, time) {
    for (let i = 0; i < arcs.length; i++) {
      let currentArc = arcs[i];
      currentArc.drawAnimatedLine(time);

      //remove arcs that are done
      if (currentArc.isDone) {
        currentArc.removeFromScene(scene);
        arcs.splice(i, 1);
        i--;
      }
    }
  }

  function updateDots(scene, time) {
    for (let i = 0; i < dots.length; i++) {
      let currentDot = dots[i];
      currentDot.update(time);
    }
  }

  function generateArc(scene, time) {
    let diceRoll = Math.random();

    if (diceRoll <= ARC_PROBABILITY) {
      if (arcs.length < MAX_ARCS) {
        let newArc = new Arc(time);
        newArc.addToScene(scene);
      }
    }
  }

  function convertRadiansToDegrees(rad) {
    return rad * (180 / Math.PI);
  }
  function vector3toLonLat(vector) {
    let lat = Math.abs(Math.asin(vector.z / GLOBE_RADIUS)); //theta
    let long = Math.abs(Math.atan2(vector.y, vector.z)); //phi

    let returnObj = {
      lat: lat,
      long: long,
    };

    return returnObj;
  }

  function toXYZ(lat, lon, radius) {
    let x = radius * Math.cos(lat) * Math.cos(lon);
    let y = radius * Math.cos(lat) * Math.sin(lon);
    let z = radius * Math.sin(lat);

    let newVector = new THREE.Vector3(x, y, z);
    return newVector;
  }

  class Dot {
    constructor(phi, theta) {
      this.phi = phi;
      this.theta = theta;

      this.vector = new THREE.Vector3();

      //get x,y,z from spherical coords
      this.vector.setFromSphericalCoords(GLOBE_RADIUS, phi, theta);

      this.geometry = new THREE.CircleGeometry(2, 5);

      //angle the hexagon towards the center of the globe
      this.geometry.lookAt(this.vector);

      // Move the dot to the newly calculated position
      this.geometry.translate(this.vector.x, this.vector.y, this.vector.z);

      this.geometry.computeBoundingSphere();

      this.boundingSphere = this.geometry.boundingSphere.center;

      this.shaderOffset = Math.floor(Math.random() * DOT_SHADER_OFFSET);

      this.uniforms = {
        u_resolution: { value: { x: null, y: null } },
        u_time: { value: 0.0 },
        u_mouse: { value: { x: null, y: null } },
      };

      this.material = new THREE.ShaderMaterial({
        vertexShader: this.vertexShader(),
        fragmentShader: this.fragmentShader(),
        uniforms: this.uniforms,
      });

      this.startTime = performance.now();

      this.mesh = new THREE.Mesh(this.geometry, this.material);
    }

    fragmentShader() {
      return `
          varying vec2 v_uv;
          uniform vec2 u_mouse;
          uniform vec2 u_resolution;
          uniform vec3 u_color;
          uniform float u_time;
        void main() {
            vec2 v = u_mouse / u_resolution;
            vec2 uv = gl_FragCoord.xy / u_resolution;
            gl_FragColor = vec4(sin(u_time * 5.0) + 0.5, 0.0, 1.0, 1.0).rgba;
        }
        `;
    }

    vertexShader() {
      return `
        varying vec2 v_uv;
        void main() {
          v_uv = uv;
          gl_Position = projectionMatrix * modelViewMatrix *    vec4(position, 1.0);
      }`;
    }

    update = (time) => {
      let seconds = time * 0.001; // convert to seconds

      if (this.uniforms.u_resolution !== undefined) {
        this.uniforms.u_resolution.value.x = window.innerWidth;
        this.uniforms.u_resolution.value.y = window.innerHeight;
      }

      this.uniforms.u_time.value = seconds + this.shaderOffset;
    };

    addToScene(scene) {
      dots.push(this);
      scene.add(this.mesh);
    }
  }

  class Arc {
    constructor(time) {
      let startInd = Math.floor(Math.random() * (dots.length + 1));
      let endInd = Math.floor(Math.random() * (dots.length + 1));

      let startLatLong = vector3toLonLat(dots[startInd].vector);
      let endLatLong = vector3toLonLat(dots[endInd].vector);

      /*
      console.log("--------------------");
      console.log(dots[startInd].vector);
      console.log(dots[endInd].vector);
      console.log(startLatLong);
      console.log(endLatLong);
      */

      //lat, long
      //this.start = [40.7128, 74.006];
      //this.end = [37.7749, 122.4194];

      this.start = [startLatLong.lat, startLatLong.long];
      this.end = [endLatLong.lat, endLatLong.long];
      const startVector = toXYZ(this.start[0], this.start[1], GLOBE_RADIUS);
      const endVector = toXYZ(this.end[0], this.end[1], GLOBE_RADIUS);
      var geoInterpolator = d3.geoInterpolate(
        [this.start[1], this.start[0]],
        [this.end[1], this.end[0]]
      );
      const control1 = geoInterpolator(0.25);
      const control2 = geoInterpolator(0.75);

      // Set the arc height to half the distance between points
      const arcHeight = startVector.distanceTo(endVector) * 0.5 + GLOBE_RADIUS;

      const controlXYZ1 = toXYZ(control1[1], control1[0], arcHeight);
      const controlXYZ2 = toXYZ(control2[1], control2[0], arcHeight);

      const curve = new THREE.CubicBezierCurve3(
        startVector,
        controlXYZ1,
        controlXYZ2,
        endVector
      );

      this.geometry = new THREE.TubeBufferGeometry(curve, 44, 1, 8);

      this.shaderOffset = Math.floor(Math.random() * ARC_SHADER_OFFSET);

      this.uniforms = {
        iTime: { value: this.shaderOffset },
        iResolution: { value: new THREE.Vector3() },
      };

      this.material = new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        fragmentShader: this.fragmentShader(),
      });

      this.arcMesh = new THREE.Mesh(this.geometry, this.material);

      this.time = time * 0.001; //convert to seconds

      this.startTime = performance.now();
      this.geometry.setDrawRange(0, 1);
      this.progress = 0;

      this.hasReachedEnd = false;
      this.isDone = false;

      this.addCircles(startVector, endVector);
    }

    fragmentShader() {
      return `
        #include <common>

        uniform vec3 iResolution;
        uniform float iTime;

        // By iq: https://www.shadertoy.com/user/iq  
        // license: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
        void mainImage( out vec4 fragColor, in vec2 fragCoord )
        {
            // Normalized pixel coordinates (from 0 to 1)
            vec2 uv = fragCoord/iResolution.xy;

            // Time varying pixel color
            vec3 col = 0.5 + 0.5*cos(iTime+uv.xyx+vec3(0,2,4));

            // Output to screen
            fragColor = vec4(col,1.0);
        }

        void main() {
          mainImage(gl_FragColor, gl_FragCoord.xy);
        }
        `;
    }

    vertexShader() {
      return `
    varying vec3 vUv; 

    void main() {
      vUv = position; 

      vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * modelViewPosition; 
    }
  `;
    }

    addCircles(startVector, endVector) {
      let startDot = new THREE.CircleGeometry(5, 15);
      let endDot = new THREE.CircleGeometry(5, 15);
      startDot.lookAt(startVector);
      endDot.lookAt(endVector);
      startDot.translate(startVector.x, startVector.y, startVector.z);
      endDot.translate(endVector.x, endVector.y, endVector.z);

      this.startCircleUniforms = {
        iTime: { value: this.time + this.shaderOffset },
        iResolution: { value: new THREE.Vector3() },
      };

      let startCircleMaterial = new THREE.ShaderMaterial({
        uniforms: this.startCircleUniforms,
        fragmentShader: this.fragmentShader(),
      });

      this.endCircleUniforms = {
        iTime: { value: this.time + this.shaderOffset + ARC_DURATION * 0.001 },
        iResolution: { value: new THREE.Vector3() },
      };

      let endCircleMaterial = new THREE.ShaderMaterial({
        uniforms: this.endCircleUniforms,
        fragmentShader: this.fragmentShader(),
      });

      let startCircle = new THREE.Mesh(startDot, startCircleMaterial);
      let endCircle = new THREE.Mesh(endDot, endCircleMaterial);

      this.startCircleMesh = startCircle;
      this.endCircleMesh = endCircle;
    }

    getArcMesh() {
      return this.arcMesh;
    }

    drawAnimatedLine = (time) => {
      let drawRangeCount = this.geometry.drawRange.count;
      let seconds = time * 0.001; // convert to seconds

      this.uniforms.iResolution.value.set(canvas.width, canvas.height, 1);
      this.uniforms.iTime.value = seconds + this.shaderOffset;

      if (this.startCircleUniforms) {
        this.startCircleUniforms.iResolution.value.set(
          canvas.width,
          canvas.height,
          1
        );
      }

      if (this.endCircleUniforms) {
        this.endCircleUniforms.iResolution.value.set(
          canvas.width,
          canvas.height,
          1
        );
      }

      const timeElapsed = performance.now() - this.startTime;

      let progress = timeElapsed / (ARC_DURATION / 2);

      this.progress = progress;

      // Arcs are made up of roughly 3000 vertices
      drawRangeCount = progress * ARC_VERTICES;

      if (!this.hasReachedEnd) {
        if (progress < 0.999) {
          // Update the draw range to reveal the curve
          this.geometry.setDrawRange(0, drawRangeCount);
        } else {
          this.hasReachedEnd = true;
          this.startTime = performance.now();
          progress = 0;
        }
      }

      if (this.hasReachedEnd) {
        if (progress < 0.999) {
          // Update the draw range to reveal the curve
          // this.geometry.setDrawRange(drawRangeCount, ARC_VERTICES);
          this.geometry.setDrawRange(-drawRangeCount, ARC_VERTICES);
        } else {
          this.isDone = true;
        }
      }
    };

    addToScene(scene) {
      arcs.push(this);
      scene.add(this.getArcMesh());
      scene.add(this.startCircleMesh);
      scene.add(this.endCircleMesh);
    }

    removeFromScene(scene) {
      let arcMesh = this.getArcMesh();
      let startCircleMesh = this.startCircleMesh;
      let endCircleMesh = this.endCircleMesh;

      startCircleMesh.geometry.dispose();
      startCircleMesh.material.dispose();
      scene.remove(startCircleMesh);

      endCircleMesh.geometry.dispose();
      endCircleMesh.material.dispose();
      scene.remove(endCircleMesh);

      arcMesh.geometry.dispose();
      arcMesh.material.dispose();
      scene.remove(arcMesh);
    }
  }

  /**
   * The main function in building a globe
   */
  async function init() {
    const { width, height } = container.getBoundingClientRect();

    let mapData = await loadMapData();

    // 1. Setup scene
    const scene = new THREE.Scene();
    // 2. Setup camera
    const camera = new THREE.PerspectiveCamera(45, width / height);
    // 3. Setup renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      canvas,
    });

    renderer.setSize(width, height);

    placeDots(mapData, scene);
    buildGlobe(scene);
    // Single geometry to contain all points.

    camera.orbitControls = new THREE.OrbitControls(camera, canvas);
    camera.orbitControls.enablePan = false;
    camera.orbitControls.enableZoom = false;
    camera.orbitControls.enableRotate = true;
    camera.orbitControls.autoRotate = true;
    camera.orbitControls.autoRotateSpeed = -0.4;
    camera.orbitControls.rotateSpeed = 0.4;
    camera.orbitControls.enableDamping = true;
    // Tweak this value based on how far/away you'd like the camera
    // to be from the globe.
    camera.position.z = -1500;
    camera.position.y = -400;
    camera.position.x = -500;

    // 4. Use requestAnimationFrame to recursively draw the scene in the DOM.
    function animate(time) {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
      camera.orbitControls.update();
      generateArc(scene, time);
      updateArcs(scene, time);
      updateDots(scene, time);
    }
    animate();
  }
})();
