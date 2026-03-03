/**
 * controlador de pedidos
 * gestion de pedidos 
 * requiere autenticacion 
 */

//importar modelos
const Pedido = require('../models/Pedido');
const detallePedido = require('../models/detallePedido');
const Carrito = require('../models/Carrito');
const Producto = require('../models/producto');
const Usuario = require('../models/Usuario');
const Categoria = require('../models/Categoria');
const Subcategoria = require('../models/Subcategoria');const Usuario = require('../models/Usuario');

/**
 * Crear pedido desde el carrito (checkout)
 * POST/ api/ cliente/ pedidos
 */

const crearPedido = async (req, res) => {
    const {sequelize} = require('./config/dataBase');
    const t = await sequelize.transaction();

    try {
        const {direccionEnvio, telefono, metodoPago = 'efectivo', notasAdicionales} = req.body;

        //validacion 1 direccion requerida
        if(!direccionEnvio || direccionEnvio.trim() === ''){
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'La direccion de envio es requerida'
            });
        }

        //validacion 2 telefono
        if(!telefono || telefono.trim() === ''){
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'El telefono es requerido'
            });
        }

        //validacion 3 metodo de pago
        const metodosValidos = ['efectivo', 'tarjeta', 'transferencia'];
        if(!metodosValidos.includes(metodoPago)) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: `Metodo de pago no valido. Opciones: ${metodosValidos.join(', ')}`
            })
        }

        //obtener items del carrito
        const carritoItems = await Carrito.findAll({
            where: { usuarioId: req.usuario.id },
            include: [{
                    model: Producto,
                    as: 'producto',
                    attibutes: ['id', 'nombre', 'precio', 'stock', 'imagen', 'activo'],
            }],
            transaction : t
        });

        if(itemsCarrito.length === 0){
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'El carrito esta vacio'
            });
        }

        //verificar stock y productos activos
        const erroresValidacion = [];
        let totalPedido = 0;

        for (const item of itemsCarritos) {
            const producto = item.producto;

            //verificar si el producto esta activo 
            if(!producto.activo) {
                erroresValidacion.push(`${producto.nombre} ya no esta dfisponible`);
                continue
            }

            //verificar stock
            if(item.cantidad > producto.stock){
                erroresValidacion.push(`${producto.nombre}: stock insuficiente (disponible: ${producto.stock}, solicitado: ${item.cantidad})`);
                continue;
            }

            //calcular total del pedido
            totalPedido = parseFloat(item.precioUnitario )* item.cantidad;
        }

        //si hay errores de validacion retornar
        if(erroresValidacion.length > 0){
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'Error de validación',
                errores: erroresValidacion
            });
        }

        //crear pedido
        const pedido = await Pedido.create({
            usuarioId: req.user.usuarioId,
            total: totalPedido,
            estado: 'pendiente',
            direccionEnvio,
            telefono,
            metodoPago,
            notasAdicionales
        }, {transaction: t});

        //crear detalles del pedido y actualizar stock
        const detallesPedido = [];

        for (const item of carritoItems) {
            const producto = item.producto;

            //crear detalle
            const detalle = await detallePedido.create({
                pedidoId: pedido.id,
                productoId: producto.id,
                cantidad: item.cantidad,
                precioUnitario: item.precioUnitario,
                subtotal: parseFloat(item.precioUnitario)* item.cantidad
            }, {transaction: t});

            detallesPedido.push(detalle);

            //actualizar stock
            producto.stock -= item.cantidad;
            await producto.save({transaction: t}); 
        }

        //vaciar carrito
        await Carrito.destroy({
            where: {usuarioId: req.usuario.id},
            transaction: t
        })

        //confirmar transaccion 
        await t.commit();

        //cargar pedido con relaciones
        await pedido.reload({
            include:[
                {
                    model: Usuario,
                    as: 'usuario',
                    attributes: ['id', 'nombre', 'email']
                },
                {
                    model: detallePedido,
                    as: 'detalles',
                    include: [{
                        model: Producto,
                        as: 'producto',
                        attributes: ['id', 'nombre', 'precio', 'imagen']
                    }]
                }
            ]
        });

        //respuesta exitosa
        res.json({
            succes: true,
            message: 'Pedido creado exitosamente',
            data: {
                pedido
            }
        })
    }catch(error){
        //revertir transaccion en caso de error
        await t.rollback();
        console.error('Error en crearPedido:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear el pedido',
            error: error.message
        });
    }
};

/**
 * obtener pedidos del cliente autenticado
 * Get /api /cliente /pedidos
 * query: ?estado= pendiente&pagina=1&limite=10
 */

const getMisPedidos = async (req,res) => {
    try{
        const {estado, pagina = 1, limite=10} = req.query;

        //filtros 
        const where = {
            usuarioId: req.usuario.id
        };
        if(estado) where.estado = estado;

        //paginacion 
        const offset = (parseInt(pagina - 1))* parseInt(limite);

        //consultar pedidos
        const {count, rows: pedidos} = await Pedido.findAndCoutnAll({
            where,
            include: [
                {
                    model: detallePedido,
                    as: 'detalles',
                    include: [{
                        model: Producto,
                        as: 'producto',
                        atributes: ['id', 'nombre', 'imagen']
                    }]
                }
            ],
            limit: parseInt(limite),
            offset,
            order: [['createdAt', 'DESC']]
        });

        //respuesta exitosa
        res.json({
            succes: true,
            message: 'Pedidos obtenidos exitosamente',
            data: {
                pedidos,
                paginacion: {
                    total: count,
                    pagina: parseInt(pagina),
                    limite: parseInt(limite),
                    totalPaginas: Math.ceil(count / parseInt(limite))
                }
            }
        });
    }catch (error){
        console.error('Error en getMisPedidos', error)
        res.status(500).json({
                success: false,
                message: 'Error al obtener mis pedidos',
                error: error.message
        });
    }
};

/**
 * obtener un pedido especifico por id
 * get /api/ cliente/ pedidos/ :id
 * solo puede ver sus pedidos admin todos
 */

const getPedidoById =  async (req, res) => {
    try{
        const {id} =req.params;

        //construir filtor (cliente solo ve sus pedidos el admin ve todos)
        const where = {id};
        if (req.usuario.rol !== 'administrador'){
            where.usuarioId = req.usuario.id;
        }

        //buscar pedido
        const pedido = await Pedido.finOne({
            where,
            include: [
                {
                    model: Usuario,
                    as: 'usuario',
                    attributes: ['id', 'nombre', 'email']
                },
                {
                    model: detallePedido,
                    as: 'detalles',
                    include: [{
                        model:Producto,
                        as: 'producto',
                        attributes: ['id', 'nombre', 'descripcion', 'imagen'],
                        include: [
                            {
                            model: Categoria,
                            as: 'categoria',
                            attributes: ['id', 'nombre']
                            },
                            {
                            model: Subcategoria,
                            as: 'subcategoria',
                            attributes: ['id', 'nombre']
                            },
                        ]
                    }]
                }
            ]
        });

        if (!pedido) {
            return res.status(404).json({
                success: false,
                message: 'Pedido no encontrado'
            });
        }

        //respuesta exitosa
        res.json({
            success: true,
            data: {
                pedido
            }
        });
    }catch (error){
        console.error('Error en getPedidoById', error),
        res.status(500).json({
            success: false,
            message: 'Error al obtener el pedido por id',
            error: error.message
        }); 
    }
};

/**
 * cancelar pedido
 * POST/ api/ cliente/ pedidos/ :id/ cancelar
 * solo se puede cancelar si el estado es pendiente
 * devuelve el stock a los productos
 */

const cancelarPedido = async (req, res) => {
    const {sequelize} = require('./config/dataBase');
    const t = await sequelize.transaction()
    try {
        const {id} = req.params;

        //buscar pedido
        const pedido = await Pedido.findOne({
            where: 
            {
                id,
                usuarioId: req.usuario.id
            },
            include: [{
                model: detallePedido,
                as: 'detalles',
                include: [
                    {
                        model: Producto,
                        as: 'producto'
                    }
                ]
            }],
            transaction: t
        });

        if (!pedido) {
            await t.rollback();
            return res.status(404).json({
                succes: false,
                message: 'Pedido no encontrado'
            });
        }

        //solo se puede cancelar si el estado del pedido es pendiente
        if (pedido.estado !== 'pendiente') {
            await t.rollback();
            return res.status(400).json({
                succes: false,
                message: `No se puede cancelar el pedido en estado ${pedido.estado}`
            });
        }

        //devuelve el stock de los productos
        for (const detalle of pedido.detalles) {
            const producto = detalle.producto;
            producto.stock += detalle.cantidad,
            await producto.save({transaction : t});
        }

        //actualizar estado del pedido 
        pedido.estado = 'cancelado',
        await pedido.save({transaction: t});

        await t.commit();
        
        //respuesta exitosa
        res.json({
            succes: true,
            message: 'Pedido cancelado exitosamente',
            data:{
                pedido
            }
        });
    }catch (error){
        await t.rollback();
        console.error('Error en cancelarPedido', error);
        res.status(500).json({
            success: false,
            message: 'Error al cancelar el pedido',
            error: error.message
        });
    }
};