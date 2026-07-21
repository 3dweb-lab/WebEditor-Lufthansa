const lenis = new Lenis({ duration: 1.5, smooth: true });
function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

gsap.registerPlugin(ScrollTrigger);
gsap.ticker.add((time) => {
  lenis.raf(time * 1000);
});
gsap.ticker.lagSmoothing(0);

// Parallax scroll transitions for images inside our clean side-by-side rows
gsap.utils.toArray(".img-wrapper").forEach((wrapper) => {
  const img = wrapper.querySelector("img");
  gsap.fromTo(
    img,
    { y: "-12%" },
    {
      y: "12%",
      ease: "none",
      scrollTrigger: {
        trigger: wrapper,
        start: "top bottom",
        end: "bottom top",
        scrub: true,
      },
    },
  );
});

// Trigger typography visibility reveals for staggered visual presentation
gsap.utils.toArray(".gs-reveal").forEach((elem) => {
  gsap.fromTo(
    elem,
    { y: 50, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      duration: 1.2,
      ease: "power3.out",
      scrollTrigger: { trigger: elem, start: "top 85%" },
    },
  );
});

const container = document.getElementById("webgl-container");
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  10,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.z = 20;

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Match tones nicely with ACESFilmic mapping for beautiful HDR response
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
container.appendChild(renderer.domElement);

/* Standard Fallback Lighting Engine */
let ambientLight, directionalLight, pointLight;

function initFallbackLighting() {
  if (!ambientLight) {
    ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);
  }
  if (!directionalLight) {
    directionalLight = new THREE.DirectionalLight(0xffffff, 1.8);
    directionalLight.position.set(5, 12, 8);
    scene.add(directionalLight);
  }
  if (!pointLight) {
    pointLight = new THREE.PointLight(0xffb84d, 1.2, 50);
    pointLight.position.set(-8, -5, -5);
    scene.add(pointLight);
  }
}
initFallbackLighting();

/* High Dynamic Range Image Environment Map Loader */
let pmremGenerator = null;
let currentHdriUrl = "source/belfast_sunset_puresky_1k.hdr";

function loadHDRI(url) {
  if (!url) return;

  if (!pmremGenerator) {
    pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
  }

  const rgbeLoader = new THREE.RGBELoader();
  rgbeLoader.setDataType(THREE.UnsignedByteType);

  rgbeLoader.load(
    url,
    function (texture) {
      const envMapRenderTarget = pmremGenerator.fromEquirectangular(texture);
      const envMap = envMapRenderTarget.texture;

      scene.environment = envMap;
      texture.dispose();

      scene.traverse(function (child) {
        if (child.isMesh && child.material) {
          child.material.needsUpdate = true;
        }
      });

      currentHdriUrl = url;
      //showNotification("HDRI Beleuchtung erfolgreich geladen!");
    },
    undefined,
    function (error) {
      console.warn(
        "Could not load selected HDRI file. Reverting to optimized fallback lighting.",
        error,
      );
      initFallbackLighting();
    },
  );
}

// Initialize with default HDR Environment
loadHDRI(currentHdriUrl);

/* Aircraft Model Loader */
let currentModel = null;
let currentModelUrl = "source/A380-841_Lufthansa_100_Year.glb";

function fitModelToCamera(model) {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  // --- ÄNDERUNG HIER ---
  // Statt fixer '5' wird die Zielgröße anhand der Fensterbreite berechnet:
  const baseWidth = 1920; // Deine Referenzbreite (z. B. Full HD)
  const baseScaleFactor = 5; // Wunschgröße bei 1920px Breite
  const targetSize = (window.innerWidth / baseWidth) * baseScaleFactor;

  const scale = targetSize / maxDim;
  model.scale.set(scale, scale, scale);
  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
}

function loadGLB(url) {
  if (!url) return;
  const loader = new THREE.GLTFLoader();
  loader.load(
    url,
    function (gltf) {
      if (currentModel) scene.remove(currentModel);
      currentModel = gltf.scene;
      fitModelToCamera(currentModel);
      scene.add(currentModel);
      currentModel.rotation.y = -0.325;
      currentModel.position.y = -0.75;
      setupScrollAnimations();
    },
    undefined,
    function (err) {
      console.log("Fallback plane geometry loading...");
      if (currentModel) scene.remove(currentModel);

      const aircraftGroup = new THREE.Group();
      const fuselageGeom = new THREE.CylinderGeometry(0.4, 0.4, 4.5, 16);
      fuselageGeom.rotateX(Math.PI / 2);

      const wingGeom = new THREE.BoxGeometry(5.5, 0.08, 0.8);
      const tailGeom = new THREE.BoxGeometry(0.1, 0.9, 0.7);
      tailGeom.translate(0, 0.5, -1.8);

      const metallicMaterial = new THREE.MeshStandardMaterial({
        color: 0x001344,
        metalness: 0.85,
        roughness: 0.15,
      });

      const wingMat = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        metalness: 0.9,
        roughness: 0.1,
      });

      const fuselage = new THREE.Mesh(fuselageGeom, metallicMaterial);
      const wings = new THREE.Mesh(wingGeom, wingMat);
      const tail = new THREE.Mesh(tailGeom, metallicMaterial);

      aircraftGroup.add(fuselage);
      aircraftGroup.add(wings);
      aircraftGroup.add(tail);

      currentModel = aircraftGroup;
      scene.add(currentModel);
      setupScrollAnimations();
    },
  );
}

loadGLB(currentModelUrl);

/* Aircraft Animation Loops */
let scrollTl = null;

function setupScrollAnimations() {
  if (!currentModel) return;
  if (scrollTl) scrollTl.kill();

  scrollTl = gsap.timeline({
    scrollTrigger: {
      trigger: "body",
      start: "top top",
      end: "bottom bottom",
      scrub: 1.5,
    },
  });

  // Rotation animation matching scroll progression
  scrollTl.to(
    currentModel.rotation,
    {
      y: Math.PI * 1.25,
      z: Math.PI * -0.5,
      ease: "none",
    },
    0,
  );

  scrollTl.to(
    currentModel.position,
    {
      y: 30,
      x: 30,
      ease: "power1.inOut",
    },
    0,
  );
}

/* 3D Floating render cycle loop */
function animate3D() {
  requestAnimationFrame(animate3D);
  if (currentModel) {
    const time = Date.now() * 0.001;
    currentModel.position.y += Math.sin(time) * 0.001;
    currentModel.rotation.x = Math.sin(time * 0.5) * 0.001;
  }
  renderer.render(scene, camera);
}
animate3D();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Modellgröße bei Fensteränderung neu an die Breite anpassen:
  if (currentModel) {
    fitModelToCamera(currentModel);
  }
});

let isEditMode = false;
let activeElement = null;

const editorBar = document.getElementById("editor-bar");
const toolsContainer = document.getElementById("editor-tools");
const fileInput = document.getElementById("local-file-input");

document.getElementById("toggle-editor-btn").addEventListener("click", () => {
  const isCollapsed = editorBar.classList.toggle("collapsed");
  isEditMode = !isCollapsed;

  if (isEditMode) {
    document.body.classList.add("edit-mode-on");
    document.body.classList.remove("edit-mode-off");

    document
      .querySelectorAll(".editable:not([data-edit-type]):not(img)")
      .forEach((el) => {
        el.setAttribute("contenteditable", "true");
      });
  } else {
    document.body.classList.remove("edit-mode-on");
    document.body.classList.add("edit-mode-off");

    document.querySelectorAll(".editable").forEach((el) => {
      el.classList.remove("active");
      if (!el.hasAttribute("data-edit-type") && el.tagName !== "IMG") {
        el.setAttribute("contenteditable", "false");
      }
    });
    activeElement = null;
    renderDefaultTools();
  }
});

document.addEventListener("click", (e) => {
  if (!isEditMode) return;
  const target = e.target.closest(".editable");

  if (!target && !e.target.closest("#editor-bar")) {
    document
      .querySelectorAll(".editable")
      .forEach((el) => el.classList.remove("active"));
    activeElement = null;
    renderDefaultTools();
    return;
  }

  if (target) {
    if (target.tagName === "A") e.preventDefault();
    document
      .querySelectorAll(".editable")
      .forEach((el) => el.classList.remove("active"));
    target.classList.add("active");
    activeElement = target;
    renderTools(target);
  }
});

document.getElementById("hdri-menu-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  renderHdriTools();
});

function renderDefaultTools() {
  toolsContainer.innerHTML =
    '<span class="placeholder-text">Wähle ein Element oder passe das HDRI an.</span>';
}

function renderHdriTools() {
  toolsContainer.innerHTML = `
            <span class="placeholder-text" style="color:var(--lh-yellow); font-weight:700;">HDRI Studio:</span>
            <button class="editor-btn ${currentHdriUrl.includes("royal_esplanade") ? "active-tool" : ""}" id="hdri-sky-btn">Explanade Sky</button>
            <button class="editor-btn ${currentHdriUrl.includes("venice_sunset") ? "active-tool" : ""}" id="hdri-sunset-btn">Venice Sunset</button>
            <input type="text" class="tool-input" style="width: 200px;" placeholder="Eigene .hdr URL..." value="${currentHdriUrl}" id="hdri-custom-url">
            <button class="editor-btn" id="hdri-load-custom">Laden</button>
        `;

  document.getElementById("hdri-sky-btn").addEventListener("click", () => {
    loadHDRI(
      "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/equirectangular/royal_esplanade_1k.hdr",
    );
    renderHdriTools();
  });

  document.getElementById("hdri-sunset-btn").addEventListener("click", () => {
    loadHDRI(
      "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/equirectangular/venice_sunset_1k.hdr",
    );
    renderHdriTools();
  });

  document.getElementById("hdri-load-custom").addEventListener("click", () => {
    const url = document.getElementById("hdri-custom-url").value.trim();
    if (url) {
      loadHDRI(url);
    }
  });
}

function renderTools(el) {
  toolsContainer.innerHTML = "";
  const editType = el.dataset.editType;

  if (editType === "video") {
    const player = document.getElementById("video-player");
    let currentId = "ZT9Ds1P-6ko";
    if (player) {
      const match = player.src.match(/embed\/([^?]+)/);
      if (match) currentId = match[1];
    }

    toolsContainer.innerHTML = `
                <div class="color-picker-wrapper" title="Hintergrundfarbe ändern">
                    <input type="color" id="video-bg-color" value="#001344">
                </div>
                <div class="divider"></div>
                <span class="material-symbols-outlined" style="color: #a3a3a3; padding: 0 4px;">smart_display</span>
                <input type="text" class="tool-input" style="width: 150px;" placeholder="YouTube ID" value="${currentId}" id="video-id-input">
            `;

    toolsContainer
      .querySelector("#video-id-input")
      .addEventListener("change", (e) => {
        if (player) {
          const id = e.target.value;
          player.src = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&showinfo=0&rel=0`;
        }
      });

    toolsContainer
      .querySelector("#video-bg-color")
      .addEventListener("input", (e) => {
        el.style.backgroundColor = e.target.value;
      });
    return;
  }

  if (el.tagName === "IMG") {
    toolsContainer.innerHTML = `
                <button class="editor-btn" id="upload-img-btn" title="Lokales Bild hochladen">
                    <span class="material-symbols-outlined">upload_file</span> Hochladen
                </button>
                <div class="divider"></div>
                <span class="material-symbols-outlined" style="color: #a3a3a3; padding: 0 4px;">image</span>
                <input type="text" class="tool-input" style="width: 220px;" placeholder="Bild-URL..." value="${el.src}" id="img-url-input">
            `;

    toolsContainer
      .querySelector("#upload-img-btn")
      .addEventListener("click", () => {
        fileInput.accept = "image/*";
        fileInput.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = function (event) {
              el.src = event.target.result;
              document.getElementById("img-url-input").value =
                "Lokal: " + file.name;
            };
            reader.readAsDataURL(file);
          }
        };
        fileInput.click();
      });

    toolsContainer
      .querySelector("#img-url-input")
      .addEventListener("change", (e) => {
        el.src = e.target.value;
      });
    return;
  }

  if (
    el.tagName === "H1" ||
    el.tagName === "H2" ||
    el.tagName === "H3" ||
    el.tagName === "P"
  ) {
    const computedStyle = window.getComputedStyle(el);
    const currentFontSize = parseInt(computedStyle.fontSize) || 16;

    toolsContainer.innerHTML = `
                <select class="tool-input" id="tool-font-family" title="Schriftart" style="width: 140px;">
                    <option value="">Standard-Schrift</option>
                    <option value="'Syne', sans-serif">Syne (Modern Bold)</option>
                    <option value="'Inter', sans-serif">Inter (Plain Sans)</option>
                    <option value="'Playfair Display', serif">Playfair Display (Luxury Serif)</option>
                    <option value="'Cormorant Garamond', serif">Cormorant (High-Class)</option>
                    <option value="'Montserrat', sans-serif">Montserrat (Elegant Sans)</option>
                    <option value="Arial, sans-serif">Arial</option>
                </select>

                <div style="display: flex; align-items: center; gap: 4px;" title="Schriftgröße">
                    <input type="number" class="tool-input" id="tool-font-size" value="${currentFontSize}" style="width: 55px;">
                    <span style="color: #a1a1aa; font-size: 0.8rem; margin-left: -2px;">px</span>
                </div>

                <div class="divider"></div>

                <button class="editor-btn text-style-btn" data-command="bold" title="Fett"><span class="material-symbols-outlined">format_bold</span></button>
                <button class="editor-btn text-style-btn" data-command="italic" title="Kursiv"><span class="material-symbols-outlined">format_italic</span></button>
                
                <div class="divider"></div>
                
                <button class="editor-btn align-btn" data-align="left" title="Links"><span class="material-symbols-outlined">format_align_left</span></button>
                <button class="editor-btn align-btn" data-align="center" title="Zentriert"><span class="material-symbols-outlined">format_align_center</span></button>
                <button class="editor-btn align-btn" data-align="right" title="Rechts"><span class="material-symbols-outlined">format_align_right</span></button>
                
                <div class="divider"></div>
                
                <div class="color-picker-wrapper" title="Textfarbe ändern">
                    <input type="color" id="tool-text-color" value="#001344">
                </div>
            `;

    toolsContainer
      .querySelector("#tool-font-family")
      .addEventListener("change", (e) => {
        el.style.fontFamily = e.target.value;
      });

    toolsContainer
      .querySelector("#tool-font-size")
      .addEventListener("input", (e) => {
        el.style.fontSize = e.target.value + "px";
      });

    toolsContainer.querySelectorAll(".text-style-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        document.execCommand(btn.dataset.command, false, null);
        el.focus();
      });
    });

    toolsContainer.querySelectorAll(".align-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        el.style.textAlign = btn.dataset.align;
      });
    });

    toolsContainer
      .querySelector("#tool-text-color")
      .addEventListener("input", (e) => {
        el.style.color = e.target.value;
      });
  }
}

document.getElementById("save-btn").addEventListener("click", () => {
  showNotification("Zustand gespeichert!");
});

function showNotification(msg) {
  const box = document.getElementById("notification-box");
  box.innerText = msg;
  box.classList.add("visible");
  setTimeout(() => {
    box.classList.remove("visible");
  }, 3000);
}
