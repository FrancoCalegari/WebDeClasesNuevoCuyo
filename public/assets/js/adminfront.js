(() => {
  const state = {
    entradas: window.__ENTRADAS__ || [],
  };

  const headers = {
    "X-Requested-With": "fetch",
    Accept: "application/json",
  };

  const entriesBody = document.getElementById("entries-body");
  const createEntryForm = document.querySelector("#create-entry form");
  const popup = document.getElementById("popup");
  const popupContent = document.getElementById("popup-content");
  const popupTitle = document.getElementById("popup-title");
  const VISIBLE_CLASS = "is-visible";

  const escapeAttr = (value = "") =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const materiaSlug = (m = {}) => {
    if (m.slug) return m.slug;
    const ruta = (m.ruta || "").split("/").filter(Boolean);
    if (!ruta.length) return "";
    const last = ruta[ruta.length - 1];
    if (last === "index.html" && ruta.length >= 2) {
      return ruta[ruta.length - 2];
    }
    return (last || "").replace(".html", "");
  };

  const prefersHtmlFallback = () => !entriesBody;

  const renderEntradas = () => {
    if (!entriesBody) return;

    if (!state.entradas || !state.entradas.length) {
      entriesBody.innerHTML = `
        <div class="empty-state-card">
          <h3>No hay entradas disponibles</h3>
          <p>Comienza creando una nueva entrada para añadir materias, clases y recursos.</p>
          <button class="btn btn--primary" type="button" data-scroll-to="create-entry">Crear la primera entrada</button>
        </div>`;
      return;
    }

    const blocks = state.entradas
      .map((entrada, idx) => renderYearBlock(entrada, idx))
      .join("");
    entriesBody.innerHTML = blocks;
  };

  const renderYearBlock = (entrada, entradaIndex) => {
    const materias = entrada?.materias || [];
    const materiasRows = materias
      .map((m, i) => renderMateriaRow(m, entradaIndex, i))
      .join("");

    return `
      <article class="year-block" data-entrada="${entradaIndex}">
        <div class="year-block__header">
          <div>
            <p class="eyebrow">Año</p>
            <h3>${escapeAttr(entrada.anio || "Sin año")}</h3>
          </div>
          <span class="chip">${materias.length} materias</span>
        </div>
        ${
          materias.length
            ? `<div class="table-wrapper">
                <table class="admin-table">
                  <thead>
                    <tr>
                      <th>Materia</th>
                      <th>Ruta</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>${materiasRows}</tbody>
                </table>
              </div>`
            : `<p class="empty-state">Aún no hay materias en este año.</p>`
        }
        <form class="stacked-form" action="/admin/entrada/${entradaIndex}/materia/add" method="POST" data-action="add-materia" data-entrada="${entradaIndex}">
          <div class="form-row">
            <input class="input" type="text" name="nombre" placeholder="Nombre de la materia" required/>
            <input class="input" type="text" name="slug" placeholder="Slug (opcional)"/>
            <select class="input" name="activo">
              <option value="true">Activa</option>
              <option value="false">Inactiva</option>
            </select>
            <button class="btn btn--secondary" type="submit">Agregar materia</button>
          </div>
        </form>
      </article>
    `;
  };

  const renderMateriaRow = (m, entradaIndex, materiaIndex) => {
    const active = m.activo !== false;
    return `
      <tr>
        <td data-title="Materia">
          <strong>${escapeAttr(m.nombre)}</strong>
        </td>
        <td data-title="Ruta">
          <code>${escapeAttr(m.ruta || "")}</code>
        </td>
        <td data-title="Estado">
          <span class="chip ${active ? "chip--success" : "chip--muted"}">${active ? "Activo" : "Inactivo"}</span>
        </td>
        <td data-title="Acciones">
          <div class="actions-group">
            <form class="inline-form" action="/admin/entrada/${entradaIndex}/materia/${materiaIndex}/edit" method="POST" data-action="edit-materia" data-entrada="${entradaIndex}" data-materia="${materiaIndex}">
              <input class="input" type="text" name="nombre" value="${escapeAttr(m.nombre)}" placeholder="Nombre" required/>
              <input class="input" type="text" name="slug" value="${escapeAttr(materiaSlug(m))}" placeholder="Slug (opcional)"/>
              <select class="input" name="activo">
                <option value="true" ${active ? "selected" : ""}>Activo</option>
                <option value="false" ${!active ? "selected" : ""}>Inactivo</option>
              </select>
              <button class="btn btn--primary btn--sm" type="submit">Guardar</button>
            </form>
            <form class="inline-form" action="/admin/entrada/${entradaIndex}/materia/${materiaIndex}/delete" method="POST" data-action="delete-materia" data-entrada="${entradaIndex}" data-materia="${materiaIndex}">
              <button class="btn btn--danger btn--sm" type="submit">Eliminar</button>
            </form>
            <button class="btn btn--outline btn--sm js-open-popup" type="button" data-entrada="${entradaIndex}" data-materia="${materiaIndex}" data-nombre="${escapeAttr(m.nombre)}">
              Propiedades
            </button>
          </div>
        </td>
      </tr>
    `;
  };

  const handleAjaxSubmit = async (event) => {
    const form = event.target;
    const action = form?.dataset?.action;
    if (!action) return;
    if (prefersHtmlFallback()) return;

    event.preventDefault();

    const hasFile =
      (form.enctype && form.enctype.includes("multipart")) ||
      form.querySelector('input[type="file"]');

    const formData = new FormData(form);
    const headersToSend = { ...headers };
    let body = formData;

    if (!hasFile) {
      const payload = Object.fromEntries(formData.entries());
      headersToSend["Content-Type"] = "application/json";
      body = JSON.stringify(payload);
    }

    const entradaIndex = Number(form.dataset.entrada);
    const materiaIndex = Number(form.dataset.materia);

    try {
      const resp = await fetch(form.action, {
        method: form.method || "POST",
        body,
        headers: headersToSend,
      });
      const data = await resp.json();
      if (!resp.ok || data.ok === false) {
        throw new Error(data.message || "No se pudo completar la acción");
      }

      if (data.entradas) {
        state.entradas = data.entradas;
        renderEntradas();
      }

      if (action === "add-entrada") {
        form.reset();
      }

      if (
        ["add-materia", "edit-materia"].includes(action) &&
        typeof materiaIndex === "number" &&
        !Number.isNaN(materiaIndex)
      ) {
        // Mantiene la vista consistente si se cambió slug/activo/nombre
        renderEntradas();
      }

      if (["add-materia", "delete-materia", "edit-materia"].includes(action)) {
        return;
      }

      const isClaseAction = ["add-clase", "edit-clase", "delete-clase"].includes(action);
      const isAdjuntoAction = ["add-adjunto", "edit-adjunto", "delete-adjunto"].includes(action);

      if (isClaseAction || isAdjuntoAction) {
        await loadPropiedades(entradaIndex, materiaIndex, { keepOpen: true });
      }
    } catch (error) {
      console.error(error);
      alert(error.message || "Ocurrió un error al guardar los cambios");
    }
  };

  const handleEntriesClick = (event) => {
    const scrollTo = event.target.closest("[data-scroll-to]");
    if (scrollTo) {
      const target = document.getElementById(scrollTo.dataset.scrollTo);
      if (target) target.scrollIntoView({ behavior: "smooth" });
      return;
    }

    const popupBtn = event.target.closest(".js-open-popup");
    if (popupBtn) {
      const entradaIndex = Number(popupBtn.dataset.entrada);
      const materiaIndex = Number(popupBtn.dataset.materia);
      openPopup(entradaIndex, materiaIndex, popupBtn.dataset.nombre);
    }
  };

  const openPopup = async (entradaIndex, materiaIndex, nombre) => {
    if (!popup || !popupContent) return;
    popupTitle.textContent = `Editar ${nombre || ""}`;
    await loadPropiedades(entradaIndex, materiaIndex);
    popup.classList.add(VISIBLE_CLASS);
    popup.setAttribute("aria-hidden", "false");
  };

  const closePopup = () => {
    if (!popup || !popupContent) return;
    popup.classList.remove(VISIBLE_CLASS);
    popup.setAttribute("aria-hidden", "true");
    popupContent.innerHTML = "";
  };

  const loadPropiedades = async (entradaIndex, materiaIndex, opts = {}) => {
    try {
      const resp = await fetch(
        `/admin/entrada/${entradaIndex}/materia/${materiaIndex}/propiedades`,
        { headers }
      );
      const data = await resp.json();
      if (!resp.ok || data.ok === false) {
        throw new Error(data.message || "No se pudieron cargar las propiedades");
      }
      popupContent.innerHTML = renderPopupContent(entradaIndex, materiaIndex, data);
      if (!opts.keepOpen) {
        popup.classList.add(VISIBLE_CLASS);
        popup.setAttribute("aria-hidden", "false");
      }
    } catch (error) {
      console.error(error);
      alert(error.message || "Error al cargar propiedades");
    }
  };

  const renderPopupContent = (entradaIndex, materiaIndex, data) => {
    const clases = data.clases || [];
    const adjuntos = data.adjuntos || [];

    let html = "<div class='section-group'>";
    html += "<div class='section-head'><h4>Clases</h4><p>Gestiona los encuentros y enlaces al material.</p></div>";

    if (clases.length) {
      html += "<ul class='list list--spaced'>";
      clases.forEach((c, i) => {
        html += `<li class="list-item">
          <form class="inline-form" action="/admin/entrada/${entradaIndex}/materia/${materiaIndex}/clase/${i}/edit" method="POST" data-action="edit-clase" data-entrada="${entradaIndex}" data-materia="${materiaIndex}" data-clase="${i}">
            <input class="input" type="text" name="numero" value="${escapeAttr(c.numero || i + 1)}" placeholder="Número" required/>
            <input class="input" type="text" name="tema" value="${escapeAttr(c.tema || "")}" placeholder="Tema" required/>
            <input class="input" type="text" name="fecha" value="${escapeAttr(c.fecha || "")}" placeholder="Fecha"/>
            <input class="input" type="url" name="video" value="${escapeAttr(c.video || "")}" placeholder="Link del video" required/>
            <input class="input" type="url" name="resumen" value="${escapeAttr(c.resumen || "")}" placeholder="Resumen (opcional)"/>
            <button class="btn btn--primary btn--sm" type="submit">Guardar</button>
          </form>
          <form class="inline-form" action="/admin/entrada/${entradaIndex}/materia/${materiaIndex}/clase/${i}/delete" method="POST" data-action="delete-clase" data-entrada="${entradaIndex}" data-materia="${materiaIndex}" data-clase="${i}">
            <button class="btn btn--danger btn--sm" type="submit">Eliminar</button>
          </form>
        </li>`;
      });
      html += "</ul>";
    } else {
      html += "<p class='empty-state'>No hay clases cargadas.</p>";
    }

    html += `<form class="stacked-form stacked-form--popup" action="/admin/entrada/${entradaIndex}/materia/${materiaIndex}/clase/add" method="POST" data-action="add-clase" data-entrada="${entradaIndex}" data-materia="${materiaIndex}">
      <div class="form-row">
        <input class="input" type="text" name="numero" placeholder="Número de clase" />
        <input class="input" type="text" name="tema" placeholder="Tema de la clase" required/>
        <input class="input" type="text" name="fecha" placeholder="Fecha de la clase" />
      </div>
      <div class="form-row">
        <input class="input" type="url" name="video" placeholder="URL del video" required/>
        <input class="input" type="url" name="resumen" placeholder="URL del resumen (opcional)" />
      </div>
      <button class="btn btn--secondary" type="submit">Agregar clase</button>
    </form>`;

    html += "</div>";

    html += "<div class='section-group'>";
    html += "<div class='section-head'><h4>Recursos</h4><p>Adjunta PDFs, DOCs u otros enlaces de apoyo. Si subes un archivo se guarda en la carpeta del año y materia.</p></div>";

    if (adjuntos.length) {
      html += "<ul class='list list--spaced'>";
      adjuntos.forEach((a, i) => {
        html += `<li class="list-item">
          <form class="inline-form" action="/admin/entrada/${entradaIndex}/materia/${materiaIndex}/adjunto/${i}/edit" method="POST" enctype="multipart/form-data" data-action="edit-adjunto" data-entrada="${entradaIndex}" data-materia="${materiaIndex}" data-adjunto="${i}">
            <input class="input" type="text" name="nombre" value="${escapeAttr(a.nombre)}" placeholder="Nombre archivo" />
            <input class="input" type="text" name="ruta" value="${escapeAttr(a.ruta)}" placeholder="URL del archivo (opcional si subes uno)" />
            <input class="input" type="file" name="archivo" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.jpg,.jpeg,.png"/>
            <button class="btn btn--primary btn--sm" type="submit">Guardar</button>
          </form>
          <form class="inline-form" action="/admin/entrada/${entradaIndex}/materia/${materiaIndex}/adjunto/${i}/delete" method="POST" data-action="delete-adjunto" data-entrada="${entradaIndex}" data-materia="${materiaIndex}" data-adjunto="${i}">
            <button class="btn btn--danger btn--sm" type="submit">Eliminar</button>
          </form>
        </li>`;
      });
      html += "</ul>";
    } else {
      html += "<p class='empty-state'>No hay adjuntos cargados.</p>";
    }

    html += `<form class="stacked-form stacked-form--popup" action="/admin/entrada/${entradaIndex}/materia/${materiaIndex}/adjunto/add" method="POST" enctype="multipart/form-data" data-action="add-adjunto" data-entrada="${entradaIndex}" data-materia="${materiaIndex}">
      <div class="form-row">
        <input class="input" type="text" name="nombre" placeholder="Nombre archivo" />
        <input class="input" type="text" name="ruta" placeholder="URL (opcional si subes archivo)" />
      </div>
      <div class="form-row">
        <input class="input" type="file" name="archivo" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.jpg,.jpeg,.png"/>
      </div>
      <button class="btn btn--secondary" type="submit">Agregar adjunto</button>
    </form>`;

    html += "</div>";

    return html;
  };

  const handlePopupClick = (event) => {
    if (event.target === popup) {
      closePopup();
    }

    const closeBtn = event.target.closest('[data-action="close-popup"]');
    if (closeBtn) {
      closePopup();
    }
  };

  const init = () => {
    renderEntradas();
    document.addEventListener("submit", handleAjaxSubmit, true);
    entriesBody?.addEventListener("click", handleEntriesClick);
    popup?.addEventListener("click", handlePopupClick);
    createEntryForm?.setAttribute("data-action", "add-entrada");
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
