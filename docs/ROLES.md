# Roles y permisos

Definido el 11/8/2026. Reemplaza al esquema anterior de tres roles más una columna
booleana suelta (`ve_ganancias`) para el acceso a Ganancias.

## Los cuatro roles

| Rol | Alcance |
|---|---|
| **Cliente** | Solo su cuenta corriente y su contraseña. |
| **Operador** | Cuentas corrientes y transacciones: consulta y **carga**. No edita ni borra transacciones. |
| **Administrador** | Acceso total **excepto Ganancias**. Administra usuarios, sincroniza, audita, edita y borra transacciones. |
| **Superadmin** | Acceso total **con Ganancias**. Es el dueño del negocio. |

La única diferencia entre Administrador y Superadmin es el módulo de Ganancias. Todo lo
demás lo pueden hacer los dos.

## Dónde está definido

En **un solo lugar por capa**, y las dos capas son espejo una de la otra:

| Capa | Archivo | Predicados |
|---|---|---|
| Aplicación | `src/lib/roles.ts` | `esStaff()`, `esAdmin()`, `veGanancias()`, `esCliente()` |
| Base de datos | `migrations/2026-08-11_roles.sql` | `es_staff()`, `es_admin()`, `ve_ganancias()` |

**Ningún archivo compara roles a mano.** Antes había ~25 archivos con
`rol === 'superusuario'` y ~20 policies con el mismo string incrustado: alcanzaba con que
un solo camino se olvidara de mirar el permiso para abrir un agujero, y eso fue
exactamente lo que pasó. Mover un permiso ahora es editar un predicado, no veinte lugares.

## Reglas de contención

Un Administrador administra usuarios pero no debe poder llegar a Ganancias. Sin reglas
explícitas tenía tres caminos para conseguirlo igual:

1. **Cambiarse el rol a sí mismo.** → Nadie modifica su propio rol.
2. **Crear un Superadmin y entrar con él.** → Nadie asigna un rol al que no llega: solo
   un Superadmin puede crear o promover a Superadmin.
3. **Resetear la clave de un Superadmin y entrar como él** — queda en la inicial
   conocida. → Un Administrador no puede editar, desactivar, resetear la clave, borrar ni
   reemplazar por email la cuenta de un Superadmin.

La tercera es la determinante: quien administra credenciales puede hacerse pasar por
cualquiera, así que sin cerrarla las otras dos son decorativas.

Se agrega una cuarta, de seguridad operativa: **un Superadmin no puede borrar su propia
cuenta**, porque si fuera el último quedaría el módulo de Ganancias inaccesible sin forma
de recuperarlo desde la app.

Todo esto se valida **en el servidor** (`src/app/api/admin/usuarios/`). La pantalla
deshabilita los controles correspondientes, pero eso es cortesía: la decisión no se toma
en el navegador.

## El camino que no pasa por la app

La policy `"Usuarios actualizan su propio perfil"` permite `update` sobre la propia fila
sin restringir columnas. Como la clave anónima de Supabase viaja en el navegador,
**cualquier usuario logueado —un operador, un cliente— podía escribirse `rol` llamando
directo a PostgREST**, sin pasar por la app ni por ninguna validación de TypeScript.

Lo cierra el trigger `profiles_proteger_permisos`: rechaza cambios de `rol`, `activo` y
`cuenta_cte` hechos desde una sesión de usuario. Las rutas de administración usan la clave
de servicio y quedan exceptuadas — ahí las reglas las aplica el servidor.

## Cómo se otorga el rol Superadmin la primera vez

Solo un Superadmin puede crear otro. Si en la base no queda ninguno, no hay forma de
asignarlo desde la app y hay que hacerlo por SQL:

```sql
update public.profiles set rol = 'superadmin' where email = 'CORREO@EJEMPLO.COM';
```

## Auditoría

Los cambios de rol, los reseteos de contraseña y las bajas de usuario quedan registrados
en la tabla `auditoria` con `accion = 'usuario'` y `entidad = 'profiles'`, con el rol
anterior y el nuevo. Se ven en la pantalla de Auditoría.
