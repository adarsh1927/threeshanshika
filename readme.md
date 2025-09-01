# Threeshanshika
A live shader inspector for Three.js. It solves the "black box" problem of GPU programming by letting you see the value of any variable inside your GLSL shaders in real-time, without interrupting your workflow.

Simply add an `inspect()` function to your shader code, and hover your mouse over your mesh to see the live values in a tooltip.

## Quick Start
This guide covers the complete setup process to use `threeshanshika` in your own Three.js projects.

**1. Clone the repository and install dependencies.**
```bash
git clone https://github.com/adarsh1927/threeshanshika.git
cd threeshanshika
npm install
```

**2. Build the library and pack it for installation.**
This workflow uses `npm pack` to create a local package, perfectly simulating a real npm installation.

First, start the development build process.
```bash
# In the threeshanshika directory, run this command and leave it running:
npm run build
```
*(Use `npm run dev` if you want to change and live testing in library; It will watch for any changes you make in `src/` and automatically rebuild the library.)*

In a **new terminal**, pack the library into a distributable file.
```bash
# In the same threeshanshika directory:
npm pack
# This creates a file like: threeshanshika-0.1.0.tgz
```

Finally, install the packed file into your Three.js project.
```bash
# cd into your Three.js project, e.g., cd ~/path/to/my-threejs-app
npm install ../path/to/threeshanshika/threeshanshika-0.1.0.tgz --legacy-peer-deps
```
*(To update with new changes, simply run the `npm pack` and the `npm install` command again.)*

**3. Use the Inspector in your code.**
Now you can import and use the inspector in your project's JavaScript.

```javascript
// In your main Three.js project file
// 

import * as THREE from 'three';
// Import the singleton inspector instance
import inspector from 'threeshanshika'; // Step 1

// Define your shaders with the inspect() function.
// The syntax is: inspect("Label for Tooltip", variable_to_inspect, slot_index);

const myVertexShader = `
    uniform float u_time;
    varying vec2 vUv;
    void main() {
        vUv = uv;

        vec3 transformedPosition = position;
        float wave = sin(position.x * 5.0 + u_time);
        transformedPosition.z += wave * 0.1;

        // Inspect a 'vec3' from the vertex shader in slot 0 
        inspect("Transformed Position (VS)", transformedPosition, 0); // Step 4

        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformedPosition, 1.0);
    }
`;

const myFragmentShader = `
    varying vec2 vUv;
    void main() {
        float distanceFromCenter = distance(vUv, vec2(0.5));
        
        // Inspect a 'float' from the fragment shader in slot 1
        inspect("Distance (FS)", distanceFromCenter, 1); // Step 4
        
        gl_FragColor = vec4(vec3(distanceFromCenter), 1.0);
    }
`;

const myMaterial = new THREE.ShaderMaterial({
    uniforms: { u_time: { value: 0.0 } },
    vertexShader: myVertexShader,
    fragmentShader: myFragmentShader,
});

// Patch the material.
inspector.patch(myMaterial); //Step 2

const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 32, 32), myMaterial);
// ... add mesh to scene, setup camera, etc. ...

// At the end of your script, get your renderer ready.
const renderer = new THREE.WebGLRenderer();
document.body.appendChild(renderer.domElement);

// Finally, initialize the inspector.
inspector.init(renderer, scene, camera); // step 3

// Your render loop
function animate(time) {
    myMaterial.uniforms.u_time.value = time * 0.001;
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();

```
**Four step process in your code:**
1. In JS, `import inspector from 'threeshanshika';`
2. In JS, `inspector.patch(myMaterial);`
3. In JS, `inspector.init(renderer, scene, camera);`
4. In GLSL, `inspect("label/tag", glsl_variable, slot_number_0_to_3);`  
    Slots are limited because each one requires a separate data output from the GPU, and WebGL has a hardware limit on the number of available outputs (typically 4-8 total).

Now, run your Three.js project. When you hover over the mesh, the inspector tooltip will appear, showing the live values.

---
## Project Structure
```
threeshanshika/
├── .gitignore
├── dist/
│   ├── threeshanshika.esm.js
│   └── threeshanshika.umd.js
├── src/
│   ├── core/
│   │   └── GLSLInstrumenter.js
│   ├── ui/
│   │   └── Tooltip.js
│   └── index.js
├── LICENSE
├── package.json
└── README.md
```