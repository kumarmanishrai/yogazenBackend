


exports.register = (req, res) => {
    const {email, password} = req.body

    if(!email || !password){
        res.status(400);
    }
    

}

exports.login = () => {


}