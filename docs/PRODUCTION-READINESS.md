# Canasino: de devnet a producción (mainnet)

> Documento vivo. Estado a **2026-10-05**. Quién lo actualiza: quien cierre un ítem lo marca aquí en el mismo PR.
> Los **valores** de los secretos nunca van a este repo; solo sus nombres (ver §9).

## 1. Resumen

| Área | Estado |
|---|---|
| Diseño de las 4 mesas (Bingo, Roulette, Domino, Poker) | Hecho y desplegado (vista previa) |
| Lógica de juego y liquidación on-chain en devnet | Probada de punta a punta con jugadores custodiales (4/4 juegos) |
| **Jugar con wallet real, sin token de operador** | **No funciona todavía** (§3, P0-3) |
| Aleatoriedad verificable (fairness-v2) | Escrita y probada, **no desplegada** (requiere el nodo Go, §3 P0-2) |
| Seguridad / auditoría externa | Pendiente |
| Legal / cumplimiento | Pendiente (§6) |

Hoy **producción es una vista previa** (apuestas pausadas). Eso es correcto: nada de lo de abajo está listo para dinero real.

## 2. Qué corre hoy

| Pieza | Dónde | Versión |
|---|---|---|
| Cadena Canasino (chain 406, network 1) | Validador compartido de Canopy `casino.val-a.grad.dev.app.canopynetwork.org` | Devnet |
| Plugin de la cadena | Validador de Canopy (auto-updater, repo `infoboy27/canopy`) | `plugin-python-v2026.277.1` (Roulette + Domino + Poker + ExpireRoom, **sin** fairness-v2) |
| Gameserver | VM `163.245.207.38`, contenedor `canasino-gameserver`, API pública `bingo.jfmcss.com` | rama `production-safe` (pre-fairness) |
| Frontend | `canasino.org`, build estático en `~/canasino-ui-static/ui-dist` (nginx) | `main` de `infoboy27/canasino`, modo vista previa |
| Operador del gameserver | `fb70ee0f20168be6d3a98f13dcbab09b1ea18c65` | 1000 CNPY de devnet |

Despliegue de plugin: tags `2026.<día-del-año>.<n>` **obligatorios** (ver `RELEASING.md` en `infoboy27/canopy`).

## 3. Bloqueadores técnicos (P0: sin esto no se abre)

### P0-1. No existe un gameserver compatible con frontend nuevo **y** plugin desplegado
- `production-safe` encaja con el plugin actual pero no tiene autenticación por wallet.
- `master` tiene toda la seguridad (wallet auth, acciones firmadas, outbox, recibos) pero **exige fairness-v2** (close/bond/espera de entropía), que el plugin actual no conoce.
- **Cierre (dos caminos):** (a) desplegar fairness-v2 completo (P0-2), o (b) un modo de compatibilidad `CANASINO_FAIRNESS_V2=0` en `master` que use el commit-reveal clásico contra el plugin actual (sirve para pruebas en devnet, **no** para dinero real).
- Dueño: ingeniería. Estado: abierto.

### P0-2. fairness-v2 necesita el nodo Go de Canopy
- El plugin rechaza bloques sin `last_block_hash` de 32 bytes; un nodo viejo detendría la cadena.
- El workflow de release del nodo (`.github/workflows/release.yml`) **nunca se ha ejecutado** en este fork y depende de credenciales de Docker Hub del namespace `canopynetwork/*`.
- **Cierre:** coordinar con Canopy el despliegue del nodo con los cambios, **antes** de publicar el plugin con fairness-v2. Probar primero en un nodo local.
- Dueño: Canopy + ingeniería. Estado: abierto.

### P0-3. Los jugadores no pueden crear mesas ni ver sus cartas sin token de operador
- Hoy el navegador llama `POST /rounds`, `/roulette/rounds`, `/domino/rounds`, `/poker/rounds` y `GET .../card`, `.../hand` con el token de operador. En producción ese token **no** va (ni debe ir) al navegador, así que esas llamadas devuelven 401.
- **Cierre:** (1) un **"table keeper"** del lado del servidor que mantenga abiertas mesas (Bingo por sala, Roulette en ciclo continuo, mesas de Poker/Domino a demanda); (2) lecturas privadas (cartas, manos) autorizadas por wallet (grant firmado o sesión MAC), no por operador.
- Dueño: ingeniería. Estado: abierto.

### P0-4. La llave del operador está en texto plano en SQLite
- `canasino.db` (tabla `keys`) guarda la llave privada del operador en la VM, y los backups diarios la incluyen.
- El modo `CASINO_REAL_MONEY_ENABLED` ya lo prohíbe: exige operador externo + firmante (`CASINO_SIGNER_SOCKET`).
- **Cierre:** firmante aislado (proceso/HSM/KMS), la llave nunca en disco del gameserver; cifrar backups; rotar al lanzar.
- Dueño: ingeniería + infra. Estado: abierto.

### P0-5. Ventana de apuesta vs. latencia de la cadena
- Roulette da 15 s para apostar; firmar + inclusión + registro tarda ~10 s en devnet → casi nadie llega.
- **Cierre:** subir `ROULETTE_BET_WINDOW_SECONDS` (45–60 s), o abrir apuestas durante la fase anterior. Medir en la cadena objetivo.
- Dueño: ingeniería. Estado: abierto (rápido).

### P0-6. Saldo y fees del operador
- El operador paga fees de todas las txs de apertura/settle/expire; con saldo 0 la plataforma se congela **sin avisar**. En devnet observamos 0 fees descontadas en 46 txs: confirmar si la cadena objetivo cobra.
- fairness-v2 exige `operator_bond` ≥ 10 CNPY y ≥ el stake del juego (Poker: 200 CNPY de buy-in).
- **Cierre:** alerta de saldo, presupuesto de bond por juego, tesorería con reposición.
- Dueño: ingeniería + operaciones.

### P0-7. Probar con la extensión FleetWallet real
- Todo lo probado usó una wallet simulada. Falta verificar con la extensión: `connect`, `getBalance`, `canopy_signAndSubmit` (join/bet/expire) y `canopy_signMessage` (autorización).
- Dueño: tú (extensión) + ingeniería. Estado: abierto.

## 4. Seguridad (P1)

- [ ] **Auditoría externa** del plugin (`contract.py`), del gameserver y del flujo de fondos, antes de dinero real.
- [ ] **Auto-updater de Canopy sin verificación de firmas/checksums** y que descarta releases en silencio. Plantearlo a Canopy; mientras tanto, nuestro repo de releases debe tener 2FA y protección de rama.
- [ ] `ADMIN_ADDRESSES` hardcodeado en el plugin (el operador es admin: puede acuñar con `MessageFaucet`). En mainnet: faucet fuera, admin = multisig/gobernanza.
- [ ] Separar roles con llaves distintas: operador (firma rondas), tesorería (recibe rake), admin (solo emergencias).
- [ ] Rate limiting y WAF (Cloudflare) delante de `bingo.jfmcss.com`; límites por IP/dirección en endpoints públicos.
- [ ] Anti-colusión en Poker/Domino heads-up (chip dumping, multi-cuenta): límites, monitoreo.
- [ ] Revisión de dependencias (`pip`, `npm`) y escaneo continuo.
- [ ] Hardening del host: SSH solo por llave/tailscale, firewall, parches, sin servicios innecesarios.
- [ ] Pruebas de carga y de caos (reinicios con rondas abiertas, validador caído).

## 5. Operación (P1)

- [ ] **CI/CD con rollback** para gameserver y frontend (hoy: `docker build` y `rsync` a mano). Imágenes con tag inmutable por commit.
- [ ] **Bloquear merges con CI en rojo** (branch protection en `infoboy27/canasino`; ya ocurrió un merge con CI rojo).
- [ ] Observabilidad: métricas y alertas (reglas base en `ops/prometheus-rules.yaml` del gameserver), logs centralizados, healthchecks externos.
- [ ] Alertas: saldo del operador, rondas abiertas viejas, errores de settle, latencia de inclusión, plugin desactualizado.
- [ ] Backups probados con restauración real; cifrados; retención definida.
- [ ] Runbooks: caída del validador, operador sin saldo, ronda atascada, rotación de llaves, rollback.
- [ ] Sweep de rondas abandonadas (ya existe: cada 15 min, `/admin/expire-stale-rounds`); revisar umbrales en mainnet.
- [ ] Versionado de plugin `2026.DDD.N` y verificación posterior al release (ver `RELEASING.md`).

## 6. Legal y cumplimiento (P0 para mainnet con dinero real; requiere abogado)

> Este bloque es una lista de temas a resolver con asesoría legal, no asesoría.

- [ ] Licencia o marco legal de juegos de azar en la(s) jurisdicción(es) de operación.
- [ ] Países/regiones bloqueados (geo-blocking) y lista de jurisdicciones prohibidas.
- [ ] Verificación de edad (18+ ya se indica en la UI; falta verificación real) y, según jurisdicción, KYC/AML.
- [ ] Juego responsable: límites de depósito/pérdida, autoexclusión, enlaces de ayuda.
- [ ] Términos de servicio, política de privacidad, política de cookies.
- [ ] Tratamiento fiscal del rake y de los premios; calidad del token CASN (consultar su encuadre legal).
- [ ] Marca y comunicaciones: no sobreprometer ("Wagering paused" y el roadmap son honestos; mantenerlo).

## 7. Producto (P2)

- [ ] Ajuste fino de animaciones con prueba humana (tiempos de bola, volteo de cartas, celebraciones).
- [ ] Accesibilidad: lectores de pantalla, contraste, navegación por teclado en las 4 mesas.
- [ ] Español (i18n) y copy final.
- [ ] Onboarding de wallet (qué es FleetWallet, cómo fondear), FAQ de "provably fair" con verificación paso a paso.
- [ ] Historial de jugadas y perfil; moderación del chat; soporte.
- [ ] Derrotas de Domino/Bingo verificadas visualmente; pruebas en navegadores y dispositivos reales.

## 8. Crecimiento (en paralelo)

- [ ] **Decidir el camino de graduación de la chain de Canasino.** Canopy retiró el mercado virtual (`/buy` y `/sell` devuelven 403) y ahora las chains se lanzan directo en L1 pagando 50 000 CNPY por adelantado (`POST /chains/{id}/activate`). Pendiente: (a) quién paga esos 50 000 CNPY, (b) qué pasa con quienes ya tienen CASN (Canopy menciona un reembolso futuro, aún no implementado), (c) si la devnet 406 sigue igual. El banner de `canasino.org` se retira en el PR #15.
- [ ] Ejecutar el plan de marketing semanal (artefacto publicado) y el roadmap público.

## 9. Inventario de secretos → AWS Secrets Manager

Reglas: valores solo en AWS Secrets Manager (nunca repo, chat, logs, ni `docker inspect`); nombre `canasino/<entorno>/<secreto>`; IAM de mínimo privilegio por servicio; el contenedor los lee al arrancar; rotación programada; acceso auditado (CloudTrail). **Todo se rota al pasar de devnet a mainnet** (las llaves de devnet no se reutilizan).

| Secreto | Para qué | Dónde está hoy | Crítico | Acción en mainnet |
|---|---|---|---|---|
| `operator-signing-key` | Firma abrir/liquidar/expirar rondas; mueve fondos | SQLite en la VM (**P0-4**) | **Crítico** | Nueva llave en firmante aislado/KMS; fuera del disco del gameserver |
| `treasury-key` | Recibe el rake (`4919006f…` en devnet) | Llave de devnet (rotar al lanzar) | **Crítico** | Nueva llave, almacenamiento en frío/multisig |
| `admin-keys` (`ADMIN_ADDRESSES`) | Mint/faucet y roles de emergencia del plugin | Direcciones hardcodeadas en `contract.py` | **Crítico** | Quitar faucet; admin = multisig/gobernanza |
| `casino-admin-token` | Bearer del API de operador (`/admin/*`, apertura de rondas) | Variable de entorno + `~/canasino/.casino-admin-token` | **Crítico** | Rotado el 2026-10-05; moverlo a Secrets Manager |
| `github-deploy-key` (`github-canasino-backup`) | SSH de la VM a los repos | `~/.ssh` de la VM | Alto | Rotar; solo lectura |
| `github-pat` | Token personal de GitHub (había quedado expuesto) | Pendiente de revocar | Alto | Revocar; usar GitHub App/OIDC con permisos mínimos |
| `github-account-2fa` | Cuenta que publica releases que el validador aplica solo | Cuenta personal | **Crítico** | 2FA con llave física; considerar org dedicada |
| `docker-hub-credentials` | Release del nodo Go (si se usa ese camino) | No configurado | Medio | Crear solo si se publica el nodo |
| `vm-ssh-keys` | Acceso a la VM | Llaves personales | Alto | Llaves por persona, sin compartidas; acceso por tailscale/bastión |
| `backup-encryption-key` | Cifrar los backups (hoy incluyen la llave del operador) | No existe | **Crítico** | Crear; backups cifrados y restauración probada |
| `cloudflare-credentials` | DNS/TLS de canasino.org y dominios | Cuentas de Cloudflare | Alto | API tokens acotados por zona |
| `monitoring-credentials` | Grafana/alertas | En la VM | Medio | Rotar; SSO si es posible |
| `aws-iam-credentials` | Acceso a Secrets Manager | Por definir | Alto | Rol de instancia (sin llaves estáticas) |

Pendiente de Canopy (no son nuestros): la contraseña del keystore del validador y las llaves del génesis de la devnet compartida.

## 10. Puertas de lanzamiento (go / no-go)

**Puerta A: devnet jugable (pruebas internas con FleetWallet real)**
- [ ] P0-1 (camino b), P0-3, P0-5, P0-7 cerrados
- [ ] Mesas abiertas por el table keeper; cartas y manos por wallet
- [ ] Alerta de saldo del operador activa

**Puerta B: beta pública en devnet (sin valor)**
- [ ] Puerta A
- [ ] CI/CD con rollback, métricas y alertas, backups cifrados y restaurados
- [ ] Rate limiting/WAF, pruebas de carga
- [ ] Textos legales mínimos y aviso de "sin valor"

**Puerta C: mainnet con dinero real**
- [ ] P0-2 (fairness-v2 + nodo Go desplegados) y P0-4 (firmante externo)
- [ ] Auditoría externa sin hallazgos críticos abiertos
- [ ] Todas las llaves nuevas, en Secrets Manager, ninguna de devnet reutilizada
- [ ] §6 resuelto con asesoría legal
- [ ] Runbooks ensayados (caída, rollback, rotación)
- [ ] Límites de apuesta conservadores y monitoreo reforzado las primeras semanas
