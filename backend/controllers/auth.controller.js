/**
 * Controlador de usuario
 * maneja el resgistro, login y obtencion del perfil de usuario
 */

/**
 * importar modelos
 */

const Usuario = require ('../models/Usuario');
const {generarToken} = require('../config/jwt');




/**
 * obtener todos los usuarios
 * GET/api/usuarios
 * query params:
 * Activo true/false (filtar por estado)
 * @param {Object} req request expre
 * @param {Object} res response express
 */

const registrar = async (req, res) => {
    try {
        const {nombre, apellido, email, password, telefono, direccion}= req.query;

        //validacion 1 verificar que todos los campos requerdios esten presentes
        if(!nombre || !apellido || !email || !password){
            return res.status(400).json({
                succes: false,
                message: 'Faltan campos requeridos: nombre, apellido, email y password son obligatorios'
            });
        }

        //validacion 2 verificar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400),json({
                success: false,
                message: 'Formato de email invalido'
            });
        }

        //validacion 3 verificar la longitud de la contraseña
        if(password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña debe tener al menos 6 caracteres'
            })
        }

        //validacion 4 verificar que el email no este registrado
        const usuarioExistente = await Usuario.finOne({where: {email}});
        if(usuarioExistente) {
            return res.status(400).json({
                success: false,
                message: 'El email ya esta registrado'
            });
        }
    

/**
 * Crear  usuario
 * el hook beforeCreate del modelo usuario se encarga de hashear la contraseña antes de guardarla
 * en el rol por defecto es cliente
 * @param {Object} req request express
 * @param {Object} res response express
 */

        // crear usuario
        const nuevoUsuario = await Usuario.create({
            nombre,
            apellido,
            email,
            password,
            rol: 'cliente',
            telefono : telefono ||null,
            direccion : direccion ||null, //si no se proporciona se establece como null
            activo:true
        });

        //generar token
        const token = generarToken({
            id:nuevoUsuario.id,
            nombre: nuevoUsuario.nombre,
            apellido: nuevoUsuario.apellido,
            email: nuevoUsuario.email,
            rol: nuevoUsuario.rol,
        });

        //Respuesta exitosa
        const usuarioRespuesta = nuevoUsuario.toJSON();
        usuarioRespuesta.password;
        res.status(201).json({
            success:true,
            message: 'Usuario registrado exitosamente',
            data:{
                usuario: nuevoUsuario.toJSON()//convertir a json para excluir campos sensibles
            }
        });
    }catch (error){
        console.error('Error en registrar');
        return res.error(500).json({
            success: false,
            message: 'Error al registrar usuario',
            error: error.message
        })
    }
};

/**
 * iniciar sesion login
 * autentica un usuario con email y contraseña
 * retorna el usuario con un token JWT si las credenciales son correctas
 * POST/api/auth/login
 * body: {email,password}
 */

const iniciarSesion = async (req, res) =>{
    try{
        //Extraer creedenciales del body
        const {email, password} = req.body;

        //validacion 1 verificar que se proporcionen ambos campos
        if (!email || !password) {
            return res.status(400).json({
                succes: false,
                message: 'El email y la contraseña son requeridos'
            })
        }

        //validacion 2 buscar usuario por email
        //necesitamos incluir el password aqui normalmente se excluye por seguridad
        const usuario = await Usuario.scope('conPassword').findOne({where: {email}});

        if (!usuario){
            return res.status(401).json({
                succes: false,
                message: 'Credenciales invalidas'
            })
        }

        //validacion 3 verificar que el usuario este activo
        if(!usuario.activo){
            return res.status(401).json({
                success: false,
                message: 'Usuario inactivo, contacta al administrador'
            });
        }

        //validacion 4 verificar que la contraseñaa sea correcta
        //usamos el metodo compararPassword del modelo usuario 
        const passwordCorrecto = await Usuario.compararPassword(password);

        if(!passwordCorrecto){
            return res.status(401).json({
                success: false,
                message: 'Credenciales invalidas'
            });
        }

        //generar token JWT con datos basicos del usuario
        const token = generarToken({
            id:usuario.id,
            email: usuario.email,
            rol: usuario.rol
        });

        //preparar respuesta sin password
        const usuarioSinPassword = usuario.toJSON();
        delete usuarioSinPassword.password;

        //respuesta exitosa
        res.json({
            success: ture,
            message: 'Inicio de sesion exitoso',
            data: {
                usuario: usuarioSinPassword,
                token
            }
        });
    }catch (error) {
        console.error('Error en iniciarSesion');
        return res.sataus(500).json({
            succes: false,
            message: 'Error al iniciar sesion',
            error: error.message
        })
    }
};

/**
 * obtener perfil del usuario autenticadio 
 * require middleware verificarAuth
 * get/api/auth/me
 * headres: {authorization: 'bearer token}
 */

const getMe= async (res, req) => {
    try{
        //el usuario ya esta en req.usuario 
        const usuario = await Usuario.findByPk(req.usuario.id, {
            attributes: {exclude: ['password']}
        });

        if (!usuario) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }
        //respuesta exitosa
        res.json({
            success: true,
            message: 'Usuario obtenido exitosamente',
            data: { usuario }
        });
    } catch (error) {
        console.error('Error en getMe')
        
        res.status(500).json({
            success: false,
            message: 'Error al obtener perfil',
            error: error.message
        });
    }
};


/**
 * actualizar usuario
 */

const updateMe = async (req, res) => {
    try{
        const {nombre, apellido, email, telefono, direccion} = req.body;

        //buscar usuartrio
        const usuario = await Usuario.findByPk(req.usuario.id);
        if (!usuario){
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        //guaradr cambios
        await usuario.save();

        //respuesta exitosa
        res.json({
            succes: true,
            message: 'Usuario actualizado exitosamente',
            data: {
                usuario: usuario.toJSON()
            }
        })
    }catch(error){
        console.error('Error en updateMe:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al actualizar usuario',
            error: error.message
        })
    }
}

/**
 * cambiar la contraseña del usuario autenticado
 * permite al usuario cambiar su contraseña
 * requiere su contraseña actual por seguridad
 * PUT/api/auth/change-password
 */

const changePassword = async (req, res) => {
    try{
        const {passwordActual, passwordNueva}= req.body;

        //validacion 1 verificar que se proporcionen ambas contraseñas
        if (!passwordActual || !passwordNueva){
            return res.status(400).json({
                success: false,
                message: 'Se requiere la contraseña actual y la contraseña nueva'
            });
        }

        //validacion 2 verificar la nueva contraseña
        if (passwordNueva.length < 6){
            return res.status(400).json({
                success: false,
                message: 'La contraseña nueva debe tener al menos 6 caracteres'
            
            });
        }

        //validacion 3 buscar usuario con password incluido
        const usuario = await Usuario.scope('withPassword').findByPk(req.usuario.id);
        if (!usuario) {
            return res.status(400).json({
                success: false,
                message: 'Usuario no encontrado'
            })
        }

        //verificar que la contraseña actual sea correcta
        const passwordCorrecta = await Usuario.compararPassword(passwordActual);
        if (!passwordCorrecta){
            return res.status(400).json({
                success: false,
                message: 'Contraseña actual incorrecta'
            })
        }

        //actualizar contraseña
        usuario.password = passwordNueva; 
        await usuario.save();

        //respuesta exitosa
        res-json({
            success: true,
            message: 'Contraseña actualizada exitosamente'
        });
    }catch (error) {
        console.error('Error en changePassword:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar contraseña',
            error: error.message
        });
    }   
};

//exportar todos los controladores
module.exports = {
    registrar,
    iniciarSesion,
    getMe,
    updateMe,
    changePassword,
}